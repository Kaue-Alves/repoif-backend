import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { R2Service, UploadProofClaims } from './r2.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn(async () => 'https://r2.test/signed'),
}));

const claims: UploadProofClaims = {
    userId: '11111111-1111-4111-8111-111111111111',
    purpose: 'subject-file',
    scopeId: '22222222-2222-4222-8222-222222222222',
    key: 'pdfs/generated-aula.pdf',
    filename: 'aula.pdf',
    contentType: 'application/pdf',
    size: 1024,
};

describe('R2Service - prova e confirmação de upload', () => {
    let service: R2Service;
    let send: jest.Mock;

    beforeEach(() => {
        const config = {
            get: (key: string) => ({
                R2_BUCKET: 'bucket',
                R2_ACCOUNT_ID: 'account',
                R2_ACCESS_KEY_ID: 'access',
                R2_SECRET_ACCESS_KEY: 'secret',
                UPLOAD_TOKEN_SECRET: 'independent-upload-secret',
                JWT_SECRET: 'jwt-secret',
            })[key],
        } as unknown as ConfigService;
        service = new R2Service(config);
        send = jest.fn(async () => ({
            ContentLength: claims.size,
            ContentType: claims.contentType,
        }));
        (service as unknown as { s3: { send: jest.Mock } }).s3.send = send;
    });

    it('FIL-05 aceita somente a prova assinada e confirma tamanho e MIME com HEAD no R2', async () => {
        const proof = service.createUploadProof(claims);

        await expect(service.verifyUploadedObject(proof, claims)).resolves.toBeUndefined();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].input).toEqual({
            Bucket: 'bucket',
            Key: claims.key,
        });
    });

    it.each([
        ['usuário', { userId: 'outro-usuario' }],
        ['finalidade', { purpose: 'assignment-attachment' as const }],
        ['escopo', { scopeId: 'outra-disciplina' }],
        ['chave', { key: 'pdfs/outra.pdf' }],
        ['nome', { filename: 'outro.pdf' }],
        ['MIME', { contentType: 'image/png' }],
        ['tamanho', { size: 1025 }],
    ])('FIL-06 rejeita troca de %s antes de consultar o R2', async (_field, override) => {
        const proof = service.createUploadProof(claims);

        await expect(service.verifyUploadedObject(proof, { ...claims, ...override }))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(send).not.toHaveBeenCalled();
    });

    it('FIL-06 rejeita prova adulterada', async () => {
        const proof = service.createUploadProof(claims);
        const tampered = `${proof.slice(0, -1)}${proof.endsWith('a') ? 'b' : 'a'}`;

        await expect(service.verifyUploadedObject(tampered, claims))
            .rejects.toMatchObject({ message: 'Prova de upload inválida ou expirada' });
        expect(send).not.toHaveBeenCalled();
    });

    it('FIL-06 rejeita prova expirada', async () => {
        const proof = service.createUploadProof(claims, -1);

        await expect(service.verifyUploadedObject(proof, claims))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(send).not.toHaveBeenCalled();
    });

    it('FIL-06 rejeita chave que não existe no R2', async () => {
        send.mockRejectedValueOnce(new Error('NotFound'));
        const proof = service.createUploadProof(claims);

        await expect(service.verifyUploadedObject(proof, claims))
            .rejects.toMatchObject({ message: 'O arquivo enviado não foi encontrado no armazenamento' });
    });

    it.each([
        [{ ContentLength: claims.size + 1, ContentType: claims.contentType }],
        [{ ContentLength: claims.size, ContentType: 'image/png' }],
    ])('FIL-06 rejeita metadados reais divergentes: %o', async metadata => {
        send.mockResolvedValueOnce(metadata);
        const proof = service.createUploadProof(claims);

        await expect(service.verifyUploadedObject(proof, claims))
            .rejects.toMatchObject({ message: 'O arquivo enviado não corresponde aos metadados informados' });
    });

    it('FIL-05 gera chaves diferentes mesmo para uploads simultâneos do mesmo nome', () => {
        expect(service.buildKey('application/pdf', 'aula.pdf'))
            .not.toBe(service.buildKey('application/pdf', 'aula.pdf'));
    });

    it('FIL-11 assina download por exatamente 60 minutos e para a chave solicitada', async () => {
        await expect(service.getPresignedDownloadUrl('pdfs/material.pdf'))
            .resolves.toBe('https://r2.test/signed');

        const [, command, options] = jest.mocked(getSignedUrl).mock.calls.at(-1)!;
        expect(command.input).toEqual({
            Bucket: 'bucket',
            Key: 'pdfs/material.pdf',
        });
        expect(options).toEqual({ expiresIn: 60 * 60 });
    });
});
