import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {

  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY não configurada');
    }

    this.resend = new Resend(resendApiKey);
  }

  async sendVerificationEmail(to: string, name: string, token: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const mailFrom = this.configService.get<string>('MAIL_FROM');

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL não configurada');
    }
    if (!mailFrom) {
      throw new Error('MAIL_FROM não configurada');
    }

    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

    const { data, error } = await this.resend.emails.send({
      from: mailFrom,
      to: [to],
      subject: 'Bem-vindo ao RepoIf - Verifique sua conta',
      html: `
        <p>Olá ${name},</p>
        <p>Obrigado por se registrar no RepoIf! Por favor, clique no link abaixo para verificar sua conta:</p>
        <a href="${verificationLink}">Verificar minha conta</a>
        <p>Se você não se registrou no RepoIf, por favor ignore este e-mail.</p>
        <p>Atenciosamente,<br/>Equipe RepoIf</p>
      `,
    });

    if (error) {
      throw new BadRequestException('Falha ao enviar e-mail de verificação.');
    }

    return data;
  }

  async sendPasswordResetEmail(to: string, name: string, token: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const mailFrom = this.configService.get<string>('MAIL_FROM');

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL não configurada');
    }
    if (!mailFrom) {
      throw new Error('MAIL_FROM não configurada');
    }

    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const { data, error } = await this.resend.emails.send({
      from: mailFrom,
      to: [to],
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

    if (error) {
      throw new BadRequestException('Falha ao enviar e-mail de redefinição de senha.');
    }

    return data;
  }

}
