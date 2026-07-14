import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

import { ClassroomService } from './classroom.service';
import {
    AddMemberDto,
    AddSubjectToClassroomDto,
    CreateClassroomDto,
    CreateInviteDto,
    UpdateClassroomDto,
} from './classroom.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('classrooms')
export class ClassroomController {
    constructor(private readonly classroomService: ClassroomService) {}

    // ---------------- Turmas ----------------

    @Roles(UserRoleEnum.TEACHER)
    @Post()
    async create(@Body() dto: CreateClassroomDto, @Req() req: any) {
        return await this.classroomService.create(dto, req.user.sub);
    }

    @Get()
    async list(@Query() query: PaginationQueryDto, @Req() req: any) {
        return await this.classroomService.listForUser(req.user.sub, req.user.role, query);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req: any) {
        return await this.classroomService.findOne(id, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateClassroomDto, @Req() req: any) {
        return await this.classroomService.update(id, dto, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() req: any) {
        await this.classroomService.remove(id, req.user.sub);
        return { success: true };
    }

    // ---------------- Disciplinas ----------------

    @Roles(UserRoleEnum.TEACHER)
    @Post(':id/subjects')
    async addSubject(@Param('id') id: string, @Body() dto: AddSubjectToClassroomDto, @Req() req: any) {
        return await this.classroomService.addSubject(id, dto, req.user.sub);
    }

    @Get(':id/subjects')
    async listSubjects(@Param('id') id: string, @Query() query: PaginationQueryDto, @Req() req: any) {
        return await this.classroomService.listSubjects(id, req.user.sub, query);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Delete(':id/subjects/:subjectId')
    async removeSubject(@Param('id') id: string, @Param('subjectId') subjectId: string, @Req() req: any) {
        await this.classroomService.removeSubject(id, subjectId, req.user.sub);
        return { success: true };
    }

    // ---------------- Membros (alunos) ----------------

    @Roles(UserRoleEnum.TEACHER)
    @Post(':id/members')
    async addMember(@Param('id') id: string, @Body() dto: AddMemberDto, @Req() req: any) {
        return await this.classroomService.addMember(id, dto, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Get(':id/members')
    async listMembers(@Param('id') id: string, @Req() req: any) {
        return await this.classroomService.listMembers(id, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Delete(':id/members/:studentId')
    async removeMember(@Param('id') id: string, @Param('studentId') studentId: string, @Req() req: any) {
        await this.classroomService.removeMember(id, studentId, req.user.sub);
        return { success: true };
    }

    // ---------------- Convites e pedidos ----------------

    @Roles(UserRoleEnum.TEACHER)
    @Post(':id/invites')
    async createInvite(@Param('id') id: string, @Body() dto: CreateInviteDto, @Req() req: any) {
        return await this.classroomService.createInvite(id, req.user.sub, dto);
    }

    @Post('join/:token')
    async joinByInvite(@Param('token') token: string, @Req() req: any) {
        return await this.classroomService.joinByInvite(token, req.user.sub, req.user.role);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Get(':id/requests')
    async listRequests(@Param('id') id: string, @Req() req: any) {
        return await this.classroomService.listPendingRequests(id, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Post(':id/requests/:studentId/accept')
    async acceptRequest(@Param('id') id: string, @Param('studentId') studentId: string, @Req() req: any) {
        return await this.classroomService.acceptRequest(id, studentId, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Post(':id/requests/:studentId/reject')
    async rejectRequest(@Param('id') id: string, @Param('studentId') studentId: string, @Req() req: any) {
        await this.classroomService.rejectRequest(id, studentId, req.user.sub);
        return { success: true };
    }
}
