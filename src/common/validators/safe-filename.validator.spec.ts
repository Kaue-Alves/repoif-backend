import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ConfirmUploadDto, RequestUploadUrlDto, UpdateFileDto } from 'src/files/file.dto';
import { ConfirmSubmissionDto, RequestSubmissionUploadUrlDto } from 'src/assignments/assignments.dto';
import { extractExtension, isBlockedFilename } from './safe-filename.validator';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';

/** Nomes das violações reportadas pelo class-validator, ou `[]` se o DTO passou. */
function violations(cls: new () => object, payload: object): string[] {
  return validateSync(plainToInstance(cls, payload)).flatMap(e => Object.keys(e.constraints ?? {}));
}

const passa = (cls: new () => object, payload: object) => violations(cls, payload).length === 0;

describe('extractExtension()', () => {
  it.each([
    ['aula.pdf', 'pdf'],
    ['AULA.PDF', 'pdf'],
    ['trabalho.pdf.exe', 'exe'],
    ['payload.exe ', 'exe'],
    ['payload.exe.', 'exe'],
    ['payload.exe. . ', 'exe'],
    ['sem-extensao', ''],
    ['.gitignore', ''],
    ['', ''],
  ])('%s -> "%s"', (nome, esperado) => {
    expect(extractExtension(nome)).toBe(esperado);
  });
});

describe('isBlockedFilename()', () => {
  it.each(['virus.exe', 'setup.msi', 'run.bat', 'script.ps1', 'app.apk', 'lib.dll', 'pacote.deb'])(
    'bloqueia %s',
    nome => expect(isBlockedFilename(nome)).toBe(true),
  );

  /** O curso é de desenvolvimento de sistemas: compartilhar código é legítimo. */
  it.each(['codigo.js', 'script.py', 'build.sh', 'lib.jar', 'aula.pdf', 'slides.pptx', 'README'])(
    'permite %s',
    nome => expect(isBlockedFilename(nome)).toBe(false),
  );

  it('só a última extensão conta', () => {
    expect(isBlockedFilename('trabalho.pdf.exe')).toBe(true);
    expect(isBlockedFilename('arquivo.exe.pdf')).toBe(false);
  });

  it('ignora caixa, espaço e ponto ao final — o Windows também ignora', () => {
    expect(isBlockedFilename('a.EXE')).toBe(true);
    expect(isBlockedFilename('a.Msi')).toBe(true);
    expect(isBlockedFilename('a.exe ')).toBe(true);
    expect(isBlockedFilename('a.exe.')).toBe(true);
  });
});

describe('@IsSafeFilename() nos DTOs de upload', () => {
  const uploadUrl = (filename: string) => ({ filename, contentType: 'application/pdf', size: 1024, subjectId: SUBJECT_ID });

  it('recusa executável ao pedir a URL de upload', () => {
    expect(passa(RequestUploadUrlDto, uploadUrl('aula.pdf'))).toBe(true);
    expect(passa(RequestUploadUrlDto, uploadUrl('virus.exe'))).toBe(false);
  });

  /**
   * Sem validar aqui, dava para pedir a URL como `a.pdf` e registrar o arquivo
   * como `a.exe` — o nome do registro é o que o aluno baixa.
   */
  it('recusa executável ao confirmar o upload', () => {
    const confirm = (originalName: string) => ({
      uploadProof: 'proof', key: 'k/1', originalName, mimeType: 'application/pdf', size: 1, subjectId: SUBJECT_ID,
    });
    expect(passa(ConfirmUploadDto, confirm('aula.pdf'))).toBe(true);
    expect(passa(ConfirmUploadDto, confirm('a.exe'))).toBe(false);
  });

  it('recusa renomear um arquivo para um executável', () => {
    expect(passa(UpdateFileDto, { originalName: 'aula-2.pdf' })).toBe(true);
    expect(passa(UpdateFileDto, { originalName: 'a.exe' })).toBe(false);
  });

  it('vale também para a entrega de trabalho do aluno', () => {
    expect(passa(RequestSubmissionUploadUrlDto, { filename: 'trabalho.pdf', contentType: 'application/pdf', size: 1024 })).toBe(true);
    expect(passa(RequestSubmissionUploadUrlDto, { filename: 'trabalho.exe', contentType: 'application/pdf', size: 1024 })).toBe(false);

    const confirm = (originalName: string) => ({ uploadProof: 'proof', key: 'k/1', originalName, mimeType: 'application/pdf', size: 1024 });
    expect(passa(ConfirmSubmissionDto, confirm('trabalho.pdf'))).toBe(true);
    expect(passa(ConfirmSubmissionDto, confirm('trabalho.pdf.exe'))).toBe(false);
  });

  it('a mensagem de erro diz que executáveis são bloqueados', () => {
    const erros = validateSync(plainToInstance(RequestUploadUrlDto, uploadUrl('virus.exe')));
    expect(erros[0].constraints?.isSafeFilename).toMatch(/não é permitido/i);
  });
});
