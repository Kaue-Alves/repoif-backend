import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SubjectService } from './subject.service';
import { SubjectDto, UpdateSubjectDto } from './subject.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';

@Controller('subjects')
@UseGuards(AuthGuard, RolesGuard)
export class SubjectController {
    constructor(private readonly subjectService: SubjectService) {}

    @Roles(UserRoleEnum.TEACHER)
    @Post()
    async create(@Body() subjectDto: SubjectDto, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.create(subjectDto, teacherId);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Get()
    async findAll(@Query() query: PaginationQueryDto, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.findAll(teacherId, query);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() request: any) {
        const userId = request.user.sub;
        return await this.subjectService.findOneForViewer(id, userId);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() subjectDto: UpdateSubjectDto, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.update(id, subjectDto, teacherId);
    }

    @Roles(UserRoleEnum.TEACHER)
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.remove(id, teacherId);
    }
}
