import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SubjectService } from './subject.service';
import { SubjectDto } from './subject.dto';
import { AuthGuard } from 'src/auth/auth.guard';

@Controller('subjects')
export class SubjectController {
    constructor(private readonly subjectService: SubjectService) {}

    @UseGuards(AuthGuard)
    @Post()
    async create(@Body() subjectDto: SubjectDto, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.create(subjectDto, teacherId);
    }

    @UseGuards(AuthGuard)
    @Get()
    async findAll(@Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.findAll(teacherId);
    }

    @UseGuards(AuthGuard)
    @Get(':id')
    async findOne(@Param('id') id: string, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.findOne(id, teacherId);
    }

    @UseGuards(AuthGuard)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() subjectDto: Partial<SubjectDto>, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.update(id, subjectDto, teacherId);
    }

    @UseGuards(AuthGuard)
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.remove(id, teacherId);
    }
}

