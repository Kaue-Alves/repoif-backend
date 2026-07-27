import { BadRequestException, NotFoundException } from '@nestjs/common';

import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { FileEntity } from 'src/db/entities/file.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { FilesService } from './files.service';

const TEACHER = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';

function buildService({ ownsSubject = true } = {}) {
    const fileRepository = {
        save: jest.fn(async (file: FileEntity) => {
            file.id = 'file-id';
            return file;
        }),
    };
    const subjectRepository = {
        findOne: jest.fn(async () => ownsSubject
            ? ({ id: SUBJECT, teacherId: TEACHER } as SubjectEntity)
            : null),
    };
    const userRepository = {
        findOne: jest.fn(async () => ({ id: TEACHER, role: UserRoleEnum.TEACHER } as UserEntity)),
    };
    const r2Service = {
        buildKey: jest.fn(() => 'pdfs/generated-aula.pdf'),
        getPresignedUploadUrl: jest.fn(async () => 'https://r2.test/upload'),
        createUploadProof: jest.fn(() => 'signed-upload-proof'),
        verifyUploadedObject: jest.fn(async () => undefined),
    };
    const service = new FilesService(
        fileRepository as never,
        subjectRepository as never,
        userRepository as never,
        r2Service as never,
    );
    return { service, fileRepository, r2Service };
}

const request = {
    filename: 'aula.pdf',
    contentType: 'application/pdf',
    size: 1024,
    subjectId: SUBJECT,
    isPublic: true,
};

const confirmation = {
    uploadProof: 'signed-upload-proof',
    key: 'pdfs/generated-aula.pdf',
    originalName: 'aula.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    subjectId: SUBJECT,
    isPublic: true,
};

describe('FilesService - upload seguro', () => {
    it('FIL-04 vincula a URL ao professor, disciplina e metadados declarados', async () => {
        const { service, r2Service } = buildService();

        await expect(service.requestUploadUrl(request, TEACHER)).resolves.toEqual({
            uploadUrl: 'https://r2.test/upload',
            key: confirmation.key,
            uploadProof: confirmation.uploadProof,
        });
        expect(r2Service.createUploadProof).toHaveBeenCalledWith({
            userId: TEACHER,
            purpose: 'subject-file',
            scopeId: SUBJECT,
            key: confirmation.key,
            filename: request.filename,
            contentType: request.contentType,
            size: request.size,
        });
    });

    it('FIL-05 verifica a prova e o objeto antes de persistir', async () => {
        const { service, fileRepository, r2Service } = buildService();

        await expect(service.confirmUpload(confirmation, TEACHER))
            .resolves.toMatchObject({ id: 'file-id', uploadedBy: TEACHER, isPublic: true });
        expect(r2Service.verifyUploadedObject).toHaveBeenCalledWith(confirmation.uploadProof, {
            userId: TEACHER,
            purpose: 'subject-file',
            scopeId: SUBJECT,
            key: confirmation.key,
            filename: confirmation.originalName,
            contentType: confirmation.mimeType,
            size: confirmation.size,
        });
        expect(r2Service.verifyUploadedObject.mock.invocationCallOrder[0])
            .toBeLessThan(fileRepository.save.mock.invocationCallOrder[0]);
    });

    it('FIL-06 não persiste chave inválida ou inexistente', async () => {
        const { service, fileRepository, r2Service } = buildService();
        r2Service.verifyUploadedObject.mockRejectedValueOnce(new BadRequestException('invalid upload'));

        await expect(service.confirmUpload(confirmation, TEACHER))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(fileRepository.save).not.toHaveBeenCalled();
    });

    it('FIL-04 não gera URL para disciplina alheia ou inexistente', async () => {
        const { service, r2Service } = buildService({ ownsSubject: false });

        await expect(service.requestUploadUrl(request, TEACHER))
            .rejects.toBeInstanceOf(NotFoundException);
        expect(r2Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
});
