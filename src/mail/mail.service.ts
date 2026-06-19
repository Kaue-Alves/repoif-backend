import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {

  private readonly client: BrevoClient;

  constructor(private readonly configService: ConfigService) {
    this.client = new BrevoClient({
      apiKey: this.configService.getOrThrow<string>('BREVO_API_KEY'),
    });
  }

  async sendVerificationEmail(to: string, name: string, token: string) {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const mailFrom = this.configService.getOrThrow<string>('MAIL_FROM');
    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

    try {
      const response = await this.client.transactionalEmails.sendTransacEmail({
        sender: { email: mailFrom, name: 'RepoIf' },
        to: [{ email: to, name }],
        subject: 'Bem-vindo ao RepoIf - Verifique sua conta',
        htmlContent: `
          <p>Olá ${name},</p>
          <p>Obrigado por se registrar no RepoIf! Por favor, clique no link abaixo para verificar sua conta:</p>
          <a href="${verificationLink}">Verificar minha conta</a>
          <p>Se você não se registrou no RepoIf, por favor ignore este e-mail.</p>
          <p>Atenciosamente,<br/>Equipe RepoIf</p>
        `,
      });
      console.log('[MailService] verificação enviada:', response.messageId);
    } catch (error) {
      console.error('Erro ao enviar e-mail de verificação:', error);
      throw new BadRequestException('Falha ao enviar e-mail de verificação.');
    }
  }

  async sendPasswordResetEmail(to: string, name: string, token: string) {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const mailFrom = this.configService.getOrThrow<string>('MAIL_FROM');
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    try {
      const response = await this.client.transactionalEmails.sendTransacEmail({
        sender: { email: mailFrom, name: 'RepoIf' },
        to: [{ email: to, name }],
        subject: 'RepoIf - Redefinição de senha',
        htmlContent: `
          <p>Olá ${name},</p>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p>Clique no link abaixo para criar uma nova senha:</p>
          <a href="${resetLink}">Redefinir minha senha</a>
          <p>Se você não solicitou isso, ignore este e-mail.</p>
          <p>Atenciosamente,<br/>Equipe RepoIf</p>
        `,
      });
      console.log('[MailService] redefinição enviada:', response.messageId);
    } catch (error) {
      console.error('Erro ao enviar e-mail de redefinição de senha:', error);
      throw new BadRequestException('Falha ao enviar e-mail de redefinição de senha.');
    }
  }

}
