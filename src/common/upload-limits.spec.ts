import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ConfirmUploadDto, RequestUploadUrlDto } from 'src/files/file.dto';
import {
  AttachmentDto,
  ConfirmSubmissionDto,
  RequestAttachmentUploadUrlDto,
  RequestSubmissionUploadUrlDto,
} from 'src/assignments/assignments.dto';
import { R2Service } from 'src/r2/r2.service';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from './upload-limits';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const MB = 1024 * 1024;

const violacoes = (cls: new () => object, payload: object): string[] =>
  validateSync(plainToInstance(cls, payload)).flatMap(e => Object.keys(e.constraints ?? {}));

const passa = (cls: new () => object, payload: object) => violacoes(cls, payload).length === 0;

describe('Limite de upload', () => {
  it('são 200 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(200 * MB);
    expect(MAX_UPLOAD_LABEL).toBe('200 MB');
  });

  describe('ao pedir a URL de upload', () => {
    const pedido = (size: number) => ({ filename: 'aula.pdf', contentType: 'application/pdf', size, subjectId: SUBJECT_ID });

    it('aceita exatamente 200 MB', () => {
      expect(passa(RequestUploadUrlDto, pedido(MAX_UPLOAD_BYTES))).toBe(true);
    });

    it('recusa um byte acima de 200 MB', () => {
      expect(passa(RequestUploadUrlDto, pedido(MAX_UPLOAD_BYTES + 1))).toBe(false);
    });

    it('recusa arquivo vazio e tamanho negativo', () => {
      expect(passa(RequestUploadUrlDto, pedido(0))).toBe(false);
      expect(passa(RequestUploadUrlDto, pedido(-1))).toBe(false);
    });

    it('recusa tamanho fracionário', () => {
      expect(passa(RequestUploadUrlDto, pedido(1.5))).toBe(false);
    });

    it('a mensagem nomeia o limite', () => {
      const erros = validateSync(plainToInstance(RequestUploadUrlDto, pedido(MAX_UPLOAD_BYTES + 1)));
      expect(erros[0].constraints?.max).toContain(MAX_UPLOAD_LABEL);
    });
  });

  /** Defesa em profundidade: o registro também não pode declarar mais de 200 MB. */
  describe('ao confirmar o upload', () => {
    const confirma = (size: number) => ({
      key: 'k/1', originalName: 'aula.pdf', mimeType: 'application/pdf', size, subjectId: SUBJECT_ID,
    });

    it('aceita 200 MB e recusa acima', () => {
      expect(passa(ConfirmUploadDto, confirma(MAX_UPLOAD_BYTES))).toBe(true);
      expect(passa(ConfirmUploadDto, confirma(MAX_UPLOAD_BYTES + 1))).toBe(false);
    });
  });

  describe('vale para anexo de trabalho e entrega de aluno', () => {
    it('anexo do enunciado', () => {
      const url = (size: number) => ({ filename: 'enunciado.pdf', contentType: 'application/pdf', size });
      expect(passa(RequestAttachmentUploadUrlDto, url(MAX_UPLOAD_BYTES))).toBe(true);
      expect(passa(RequestAttachmentUploadUrlDto, url(MAX_UPLOAD_BYTES + 1))).toBe(false);

      const anexo = (attachmentSize: number) => ({
        attachmentKey: 'k/1', attachmentName: 'enunciado.pdf', attachmentMimeType: 'application/pdf', attachmentSize,
      });
      expect(passa(AttachmentDto, anexo(MAX_UPLOAD_BYTES))).toBe(true);
      expect(passa(AttachmentDto, anexo(MAX_UPLOAD_BYTES + 1))).toBe(false);
    });

    it('entrega do aluno', () => {
      const url = (size: number) => ({ filename: 'trabalho.pdf', contentType: 'application/pdf', size });
      expect(passa(RequestSubmissionUploadUrlDto, url(MAX_UPLOAD_BYTES))).toBe(true);
      expect(passa(RequestSubmissionUploadUrlDto, url(MAX_UPLOAD_BYTES + 1))).toBe(false);

      const confirma = (size: number) => ({ key: 'k/1', originalName: 'trabalho.pdf', mimeType: 'application/pdf', size });
      expect(passa(ConfirmSubmissionDto, confirma(MAX_UPLOAD_BYTES))).toBe(true);
      expect(passa(ConfirmSubmissionDto, confirma(MAX_UPLOAD_BYTES + 1))).toBe(false);
    });
  });
});

describe('R2Service.getPresignedUploadUrl()', () => {
  const configStub = {
    get: (chave: string) =>
      ({ R2_BUCKET: 'bucket', R2_ACCOUNT_ID: 'conta', R2_ACCESS_KEY_ID: 'chave', R2_SECRET_ACCESS_KEY: 'segredo' })[chave],
  } as unknown as ConfigService;

  const service = new R2Service(configStub);
  const cabecalhosAssinados = (url: string) =>
    decodeURIComponent(new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');

  /**
   * A propriedade que sustenta o limite: `content-length` faz parte da assinatura, então
   * o R2 recusa um corpo cujo tamanho não bata com o declarado ao pedir a URL. Sem isso,
   * bastaria pedir a URL dizendo "1 MB" e enviar 5 GB.
   */
  it('assina o content-length, e não só o host', async () => {
    const url = await service.getPresignedUploadUrl('k/1', 'application/pdf', 1234);
    expect(cabecalhosAssinados(url)).toEqual(expect.arrayContaining(['content-length', 'host']));
  });

  it('a URL expira', async () => {
    const url = await service.getPresignedUploadUrl('k/1', 'application/pdf', 1234, 300);
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');
  });
});
