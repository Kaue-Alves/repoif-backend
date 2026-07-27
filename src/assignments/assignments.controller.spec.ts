import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from 'src/auth/auth.guard';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AssignmentsController } from './assignments.controller';

describe('AssignmentsController - contrato de autorização', () => {
    it('ATV-01 aplica autenticação e autorização por papel em todo o controller', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, AssignmentsController))
            .toEqual([AuthGuard, RolesGuard]);
    });

    it.each([
        'requestAttachmentUploadUrl',
        'create',
        'update',
        'remove',
        'listSubmissions',
        'allowResubmit',
    ] as const)('ATV-01/06/11 restringe %s a TEACHER', method => {
        expect(Reflect.getMetadata(ROLES_KEY, AssignmentsController.prototype[method]))
            .toEqual([UserRoleEnum.TEACHER]);
    });

    it.each([
        'requestSubmissionUploadUrl',
        'confirmSubmission',
        'getMySubmission',
    ] as const)('ATV-08/13 restringe %s a STUDENT', method => {
        expect(Reflect.getMetadata(ROLES_KEY, AssignmentsController.prototype[method]))
            .toEqual([UserRoleEnum.STUDENT]);
    });

    it.each([
        'listBySubject',
        'findOne',
        'downloadAttachment',
        'downloadSubmission',
    ] as const)('ATV-04 mantém %s disponível a qualquer usuário autenticado', method => {
        expect(Reflect.getMetadata(ROLES_KEY, AssignmentsController.prototype[method]))
            .toBeUndefined();
    });
});
