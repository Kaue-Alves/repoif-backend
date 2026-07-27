import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export type UploadPurpose = 'subject-file' | 'assignment-attachment' | 'assignment-submission';

export interface UploadProofClaims {
    userId: string;
    purpose: UploadPurpose;
    scopeId: string;
    key: string;
    filename: string;
    contentType: string;
    size: number;
}

interface SignedUploadProof extends UploadProofClaims {
    version: 1;
    expiresAt: number;
}

@Injectable()
export class R2Service {
    private readonly s3: S3Client;
    private readonly bucket: string;

    constructor(private readonly configService: ConfigService) {
        this.bucket = configService.get<string>('R2_BUCKET')!;
        this.s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${configService.get<string>('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: configService.get<string>('R2_ACCESS_KEY_ID')!,
                secretAccessKey: configService.get<string>('R2_SECRET_ACCESS_KEY')!,
            },
        });
    }

    buildKey(mimeType: string, filename: string): string {
        let folder = 'others';
        if (mimeType.startsWith('image/')) folder = 'images';
        else if (mimeType.startsWith('video/')) folder = 'videos';
        else if (mimeType === 'application/pdf') folder = 'pdfs';
        return `${folder}/${randomUUID()}-${filename}`;
    }

    /**
     * A prova vincula a confirmação à solicitação autenticada. Ela não é um JWT
     * deliberadamente: assim nunca pode ser confundida com um token de acesso.
     */
    createUploadProof(claims: UploadProofClaims, expiresIn = 300): string {
        const payload: SignedUploadProof = {
            ...claims,
            version: 1,
            expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
        };
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
        return `${encoded}.${this.signUploadProof(encoded)}`;
    }

    async verifyUploadedObject(proof: string, expected: UploadProofClaims): Promise<void> {
        const claims = this.decodeUploadProof(proof);
        const matches =
            claims.userId === expected.userId &&
            claims.purpose === expected.purpose &&
            claims.scopeId === expected.scopeId &&
            claims.key === expected.key &&
            claims.filename === expected.filename &&
            claims.contentType === expected.contentType &&
            claims.size === expected.size;
        if (!matches) {
            throw new BadRequestException('A confirmação não corresponde ao upload solicitado');
        }

        try {
            const metadata = await this.s3.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: expected.key,
            }));
            if (
                Number(metadata.ContentLength) !== expected.size ||
                metadata.ContentType !== expected.contentType
            ) {
                throw new BadRequestException('O arquivo enviado não corresponde aos metadados informados');
            }
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new BadRequestException('O arquivo enviado não foi encontrado no armazenamento');
        }
    }

    private signUploadProof(encodedPayload: string): string {
        const secret =
            this.configService.get<string>('UPLOAD_TOKEN_SECRET') ??
            this.configService.get<string>('JWT_SECRET');
        if (!secret) {
            throw new Error('UPLOAD_TOKEN_SECRET ou JWT_SECRET deve estar configurado');
        }
        return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    }

    private decodeUploadProof(proof: string): SignedUploadProof {
        try {
            const [encoded, signature, extra] = proof.split('.');
            if (!encoded || !signature || extra) throw new Error('invalid format');

            const expectedSignature = this.signUploadProof(encoded);
            const received = Buffer.from(signature, 'base64url');
            const expected = Buffer.from(expectedSignature, 'base64url');
            if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
                throw new Error('invalid signature');
            }

            const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedUploadProof;
            if (
                claims.version !== 1 ||
                !Number.isInteger(claims.expiresAt) ||
                claims.expiresAt < Math.floor(Date.now() / 1000)
            ) {
                throw new Error('expired proof');
            }
            return claims;
        } catch {
            throw new BadRequestException('Prova de upload inválida ou expirada');
        }
    }

    /**
     * `size` entra como `ContentLength` e, com isso, passa a fazer parte dos cabeçalhos
     * assinados (`X-Amz-SignedHeaders: content-length;host`). O próprio R2 então recusa um
     * corpo de tamanho diferente do declarado — o limite de upload deixa de depender de o
     * cliente ser honesto ao pedir a URL.
     */
    async getPresignedUploadUrl(
        key: string,
        contentType: string,
        size: number,
        expiresIn = 300,
    ): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            ContentLength: size,
        });
        return getSignedUrl(this.s3, command, { expiresIn });
    }

    async getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.s3, command, { expiresIn });
    }

    async deleteObject(key: string): Promise<void> {
        await this.s3.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }
}
