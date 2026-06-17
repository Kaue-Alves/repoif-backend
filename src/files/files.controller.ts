import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { ConfirmUploadDto, RequestUploadUrlDto, UpdateFileDto } from './file.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Controller('files')
export class FilesController {

    constructor(
        private readonly filesService: FilesService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    // Extrai userId do token sem exigir autenticação obrigatória
    private async extractUserId(request: any): Promise<string | undefined> {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return undefined;
        try {
            const token = authHeader.split(' ')[1];
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get<string>('JWT_SECRET'),
            });
            return payload.sub;
        } catch {
            return undefined;
        }
    }

    @UseGuards(AuthGuard)
    @Post('upload-url')
    async requestUploadUrl(@Body() dto: RequestUploadUrlDto, @Req() request: any) {
        return this.filesService.requestUploadUrl(dto, request.user.sub);
    }

    @UseGuards(AuthGuard)
    @Post()
    async confirmUpload(@Body() dto: ConfirmUploadDto, @Req() request: any) {
        return this.filesService.confirmUpload(dto, request.user.sub);
    }

    @Get('subject/:subjectId')
    async findBySubject(@Param('subjectId') subjectId: string, @Req() request: any) {
        const userId = await this.extractUserId(request);
        return this.filesService.findBySubject(subjectId, userId);
    }

    @Get(':id/download')
    async getDownloadUrl(@Param('id') id: string, @Req() request: any) {
        const userId = await this.extractUserId(request);
        const url = await this.filesService.getDownloadUrl(id, userId);
        return { url };
    }

    @UseGuards(AuthGuard)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateFileDto, @Req() request: any) {
        return this.filesService.update(id, dto, request.user.sub);
    }

    @UseGuards(AuthGuard)
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() request: any) {
        await this.filesService.remove(id, request.user.sub);
    }
}
