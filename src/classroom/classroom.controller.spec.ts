import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from 'src/auth/auth.guard';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ClassroomController } from './classroom.controller';

describe('ClassroomController - contrato de autorização', () => {
    it('TUR-01 aplica autenticação e autorização por papel em todo o controller', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, ClassroomController))
            .toEqual([AuthGuard, RolesGuard]);
    });

    it.each([
        'create',
        'update',
        'remove',
        'addSubject',
        'removeSubject',
        'addMember',
        'listMembers',
        'removeMember',
        'createInvite',
        'listRequests',
        'acceptRequest',
        'rejectRequest',
    ] as const)('TUR-01/04/08/13 restringe %s a TEACHER', method => {
        expect(Reflect.getMetadata(ROLES_KEY, ClassroomController.prototype[method]))
            .toEqual([UserRoleEnum.TEACHER]);
    });

    it.each(['list', 'findOne', 'listSubjects'] as const)(
        'TUR-02/03 permite %s somente a professor ou aluno',
        method => {
            expect(Reflect.getMetadata(ROLES_KEY, ClassroomController.prototype[method]))
                .toEqual([UserRoleEnum.TEACHER, UserRoleEnum.STUDENT]);
        },
    );

    it('TUR-12 restringe ingresso por convite a STUDENT', () => {
        expect(Reflect.getMetadata(ROLES_KEY, ClassroomController.prototype.joinByInvite))
            .toEqual([UserRoleEnum.STUDENT]);
    });
});
