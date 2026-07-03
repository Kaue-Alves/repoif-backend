import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';

import { AssignmentsService } from './assignments.service';
import {
    ConfirmSubmissionDto,
    CreateAssignmentDto,
    RequestAttachmentUploadUrlDto,
    RequestSubmissionUploadUrlDto,
    UpdateAssignmentDto,
} from './assignments.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('assignments')
export class AssignmentsController {
    constructor(private readonly assignmentsService: AssignmentsService) {}

    // ---------------- Trabalhos ----------------

    @Roles(UserRoleEnum.TEACHER)
    @Post('attachment/upload-url')
    async requestAttachmentUploadUrl(@Body() dto: RequestAttachmentUploadUrlDto) {
        return this.assignmentsService.requestAttachmentUploadUrl(dto);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Post()
    async create(@Body() dto: CreateAssignmentDto, @Req() req: any) {
        return this.assignmentsService.create(dto, req.user.sub);
    }

    @Get('subject/:subjectId')
    async listBySubject(@Param('subjectId') subjectId: string, @Req() req: any) {
        return this.assignmentsService.listBySubject(subjectId, req.user.sub);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req: any) {
        return this.assignmentsService.findOne(id, req.user.sub);
    }

    @Get(':id/attachment/download')
    async downloadAttachment(@Param('id') id: string, @Req() req: any) {
        const url = await this.assignmentsService.getAttachmentDownloadUrl(id, req.user.sub);
        return { url };
    }

    @Roles(UserRoleEnum.TEACHER)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto, @Req() req: any) {
        return this.assignmentsService.update(id, dto, req.user.sub);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() req: any) {
        await this.assignmentsService.remove(id, req.user.sub);
        return { success: true };
    }

    // ---------------- Entregas do aluno ----------------

    @Roles(UserRoleEnum.STUDENT)
    @Post(':id/submission/upload-url')
    async requestSubmissionUploadUrl(
        @Param('id') id: string,
        @Body() dto: RequestSubmissionUploadUrlDto,
        @Req() req: any,
    ) {
        return this.assignmentsService.requestSubmissionUploadUrl(id, dto, req.user.sub);
    }

    @Roles(UserRoleEnum.STUDENT)
    @Post(':id/submission')
    async confirmSubmission(@Param('id') id: string, @Body() dto: ConfirmSubmissionDto, @Req() req: any) {
        return this.assignmentsService.confirmSubmission(id, dto, req.user.sub);
    }

    @Roles(UserRoleEnum.STUDENT)
    @Get(':id/my-submission')
    async getMySubmission(@Param('id') id: string, @Req() req: any) {
        return this.assignmentsService.getMySubmission(id, req.user.sub);
    }

    // ---------------- Entregas: visão do professor ----------------

    @Roles(UserRoleEnum.TEACHER)
    @Get(':id/submissions')
    async listSubmissions(@Param('id') id: string, @Req() req: any) {
        return this.assignmentsService.listSubmissions(id, req.user.sub);
    }

    @Get(':id/submissions/:submissionId/download')
    async downloadSubmission(
        @Param('id') id: string,
        @Param('submissionId') submissionId: string,
        @Req() req: any,
    ) {
        const url = await this.assignmentsService.getSubmissionDownloadUrl(id, submissionId, req.user.sub);
        return { url };
    }

    @Roles(UserRoleEnum.TEACHER)
    @Post(':id/submissions/:studentId/allow-resubmit')
    async allowResubmit(@Param('id') id: string, @Param('studentId') studentId: string, @Req() req: any) {
        return this.assignmentsService.allowResubmit(id, studentId, req.user.sub);
    }
}
