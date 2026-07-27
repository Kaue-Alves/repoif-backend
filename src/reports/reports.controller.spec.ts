import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from 'src/auth/auth.guard';
import { ReportsController } from './reports.controller';

describe('ReportsController - contrato de autorização', () => {
    it('DEN-01/02/05 exige autenticação para criar e consultar denúncias', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([AuthGuard]);
    });
});
