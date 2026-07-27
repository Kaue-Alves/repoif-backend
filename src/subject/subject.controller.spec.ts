import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from 'src/auth/auth.guard';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { SubjectController } from './subject.controller';

describe('SubjectController - autorização', () => {
    it('SUB-01 protege todo o controller com autenticação e papéis', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, SubjectController))
            .toEqual([AuthGuard, RolesGuard]);
    });

    it.each(['create', 'findAll', 'update', 'remove'] as const)(
        'SUB-01/02 restringe %s a TEACHER',
        method => {
            expect(Reflect.getMetadata(ROLES_KEY, SubjectController.prototype[method]))
                .toEqual([UserRoleEnum.TEACHER]);
        },
    );

    it('SUB-04 permite leitura a qualquer usuário autenticado', () => {
        expect(Reflect.getMetadata(ROLES_KEY, SubjectController.prototype.findOne)).toBeUndefined();
    });
});
