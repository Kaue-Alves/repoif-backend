import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from 'src/auth/auth.guard';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { AdminController } from './admin.controller';

describe('AdminController - contrato de autorização', () => {
    it('ADM-01 aplica autenticação e autorização por papel a todo o controller', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, AdminController))
            .toEqual([AuthGuard, RolesGuard]);
    });

    it('ADM-01 restringe todas as rotas ao papel ADMIN', () => {
        expect(Reflect.getMetadata(ROLES_KEY, AdminController))
            .toEqual([UserRoleEnum.ADMIN]);
    });
});
