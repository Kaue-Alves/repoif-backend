import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {

  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: this.configService.get<boolean>('MAIL_SECURE') ?? false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendVerificationEmail(to: string, name: string, token: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const mailFrom = this.configService.get<string>('MAIL_FROM');

    if (!frontendUrl) throw new Error('FRONTEND_URL não configurada');
    if (!mailFrom) throw new Error('MAIL_FROM não configurada');

    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: mailFrom,
        to,
        subject: 'Bem-vindo ao RepoIf - Verifique sua conta',
        html: `
          <p>Olá ${name},</p>
          <p>Obrigado por se registrar no RepoIf! Por favor, clique no link abaixo para verificar sua conta:</p>
          <a href="${verificationLink}">Verificar minha conta</a>
          <p>Se você não se registrou no RepoIf, por favor ignore este e-mail.</p>
          <p>Atenciosamente,<br/>Equipe RepoIf</p>
        `,
      });
    } catch {
      throw new BadRequestException('Falha ao enviar e-mail de verificação.');
    }
  }

  async sendPasswordResetEmail(to: string, name: string, token: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const mailFrom = this.configService.get<string>('MAIL_FROM');

    if (!frontendUrl) throw new Error('FRONTEND_URL não configurada');
    if (!mailFrom) throw new Error('MAIL_FROM não configurada');

    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: mailFrom,
        to,
        subject: 'RepoIf - Redefinição de senha',
        html: `
          <p>Olá ${name},</p>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p>Clique no link abaixo para criar uma nova senha:</p>
          <a href="${resetLink}">Redefinir minha senha</a>
          <p>Se você não solicitou isso, ignore este e-mail.</p>
          <p>Atenciosamente,<br/>Equipe RepoIf</p>
        `,
      });
    } catch {
      throw new BadRequestException('Falha ao enviar e-mail de redefinição de senha.');
    }
  }

}
