import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { RolesGuard } from './roles.guard';

function contextFor(user?: { sub: string; role: UserRoleEnum }): ExecutionContext {
    const handler = () => undefined;
    class Controller {}

    return {
        getHandler: () => handler,
        getClass: () => Controller,
        switchToHttp: () => ({
            getRequest: () => ({ user }),
        }),
    } as unknown as ExecutionContext;
}

function buildGuard(requiredRoles?: UserRoleEnum[]) {
    const reflector = {
        getAllAndOverride: jest.fn(() => requiredRoles),
    } as unknown as jest.Mocked<Reflector>;
    return { guard: new RolesGuard(reflector), reflector };
}

describe('RolesGuard', () => {
    it('AUT-20 permite rota sem restrição de papel', () => {
        const { guard } = buildGuard();
        expect(guard.canActivate(contextFor())).toBe(true);
    });

    it.each([
        UserRoleEnum.ADMIN,
        UserRoleEnum.TEACHER,
        UserRoleEnum.STUDENT,
    ])('AUT-20 permite o papel declarado: %s', role => {
        const { guard } = buildGuard([role]);
        expect(guard.canActivate(contextFor({ sub: 'user-id', role }))).toBe(true);
    });

    it('AUT-20 permite quando o papel está entre várias alternativas', () => {
        const { guard } = buildGuard([UserRoleEnum.ADMIN, UserRoleEnum.TEACHER]);
        expect(guard.canActivate(contextFor({
            sub: 'teacher-id',
            role: UserRoleEnum.TEACHER,
        }))).toBe(true);
    });

    it.each([
        undefined,
        { sub: 'student-id', role: UserRoleEnum.STUDENT },
    ])('AUT-20 nega usuário ausente ou com papel insuficiente', user => {
        const { guard } = buildGuard([UserRoleEnum.ADMIN]);

        expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
    });

    it('AUT-20 consulta metadados do handler antes dos metadados do controller', () => {
        const { guard, reflector } = buildGuard([UserRoleEnum.ADMIN]);
        const context = contextFor({ sub: 'admin-id', role: UserRoleEnum.ADMIN });

        guard.canActivate(context);

        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
            'roles',
            [context.getHandler(), context.getClass()],
        );
    });
});
