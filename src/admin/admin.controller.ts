import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { AdminService } from './admin.service';
import {
    CreateUserByAdminDto,
    ListFilesQueryDto,
    ListReportsQueryDto,
    ListUsersQueryDto,
    UpdateReportStatusDto,
    UpdateUserRoleDto,
} from './admin.dto';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRoleEnum.ADMIN)
export class AdminController {

    constructor(private readonly adminService: AdminService) {}

    // ------------------------------------------------------------ DASHBOARD

    @Get('stats')
    async getStats() {
        return this.adminService.getStats();
    }

    // ---------------------------------------------------------------- USERS

    @Get('users')
    async listUsers(@Query() query: ListUsersQueryDto) {
        return this.adminService.listUsers(query);
    }

    @Post('users')
    async createUser(@Body() dto: CreateUserByAdminDto) {
        return this.adminService.createUser(dto);
    }

    @Patch('users/:id/role')
    async updateUserRole(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserRoleDto,
        @Req() request: Request & { user: { sub: string } },
    ) {
        return this.adminService.updateUserRole(id, dto, request.user.sub);
    }

    @Delete('users/:id')
    async softDeleteUser(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: Request & { user: { sub: string } },
    ) {
        return this.adminService.softDeleteUser(id, request.user.sub);
    }

    @Post('users/:id/restore')
    async restoreUser(@Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.restoreUser(id);
    }

    // ---------------------------------------------------------------- FILES

    @Get('files')
    async listFiles(@Query() query: ListFilesQueryDto) {
        return this.adminService.listFiles(query);
    }

    @Get('files/:id/download')
    async getFileDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
        const url = await this.adminService.getFileDownloadUrl(id);
        return { url };
    }

    @Delete('files/:id')
    async deleteFile(
        @Param('id', ParseUUIDPipe) id: string,
        @Query('hard') hard?: string,
    ) {
        return this.adminService.deleteFile(id, hard === 'true');
    }

    @Post('files/:id/restore')
    async restoreFile(@Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.restoreFile(id);
    }

    // -------------------------------------------------------------- REPORTS

    @Get('reports')
    async listReports(@Query() query: ListReportsQueryDto) {
        return this.adminService.listReports(query);
    }

    @Patch('reports/:id')
    async updateReportStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateReportStatusDto,
        @Req() request: Request & { user: { sub: string } },
    ) {
        return this.adminService.updateReportStatus(id, dto, request.user.sub);
    }
}
