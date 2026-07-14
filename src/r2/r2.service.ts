import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
        return `${folder}/${Date.now()}-${filename}`;
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
