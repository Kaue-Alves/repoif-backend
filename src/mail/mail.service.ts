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
        sender: { email: mailFrom, name: 'RepoIF' },
        to: [{ email: to, name }],
        subject: 'Bem-vindo ao RepoIF - Verifique sua conta',
        htmlContent: this.buildEmailTemplate({
          heading: 'Bem-vindo ao RepoIF 👋',
          bodyHtml: `
            <p style="margin:0 0 16px;">Olá <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;">Obrigado por se registrar no RepoIF! Para começar a usar sua conta, confirme seu e-mail clicando no botão abaixo:</p>
          `,
          button: { label: 'Verificar minha conta', url: verificationLink },
          footnote:
            'Se você não se registrou no RepoIF, pode ignorar este e-mail com segurança.',
        }),
      });
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
        sender: { email: mailFrom, name: 'RepoIF' },
        to: [{ email: to, name }],
        subject: 'RepoIF - Redefinição de senha',
        htmlContent: this.buildEmailTemplate({
          heading: 'Redefinição de senha',
          bodyHtml: `
            <p style="margin:0 0 16px;">Olá <strong>${name}</strong>,</p>
            <p style="margin:0 0 16px;">Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
          `,
          button: { label: 'Redefinir minha senha', url: resetLink },
          footnote:
            'Se você não solicitou a redefinição, ignore este e-mail — sua senha permanece a mesma.',
        }),
      });
    } catch (error) {
      console.error('Erro ao enviar e-mail de redefinição de senha:', error);
      throw new BadRequestException('Falha ao enviar e-mail de redefinição de senha.');
    }
  }

  /** Notifica os alunos de que um novo trabalho foi criado. */
  async sendNewAssignmentEmail(
    to: string,
    studentName: string,
    subjectName: string,
    assignmentTitle: string,
    dueDate: Date,
    assignmentId: string,
  ) {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const mailFrom = this.configService.getOrThrow<string>('MAIL_FROM');
    const link = `${frontendUrl}/assignments/${assignmentId}`;
    const due = dueDate.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    await this.client.transactionalEmails.sendTransacEmail({
      sender: { email: mailFrom, name: 'RepoIF' },
      to: [{ email: to, name: studentName }],
      subject: `Novo trabalho: ${assignmentTitle}`,
      htmlContent: this.buildEmailTemplate({
        heading: 'Novo trabalho disponível 📋',
        bodyHtml: `
          <p style="margin:0 0 16px;">Olá <strong>${studentName}</strong>,</p>
          <p style="margin:0 0 16px;">Um novo trabalho foi criado na disciplina <strong>${subjectName}</strong>:</p>
          <p style="margin:0 0 8px;"><strong>${assignmentTitle}</strong></p>
          <p style="margin:0 0 16px;">Data limite de entrega: <strong>${due}</strong>.</p>
        `,
        button: { label: 'Ver trabalho', url: link },
        footnote: 'Acesse o RepoIF para enviar sua entrega antes do prazo.',
      }),
    });
  }

  /** Notifica o professor de que um aluno entregou um trabalho. */
  async sendSubmissionEmail(
    to: string,
    teacherName: string,
    studentName: string,
    subjectName: string,
    assignmentTitle: string,
    assignmentId: string,
  ) {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const mailFrom = this.configService.getOrThrow<string>('MAIL_FROM');
    const link = `${frontendUrl}/assignments/${assignmentId}`;

    await this.client.transactionalEmails.sendTransacEmail({
      sender: { email: mailFrom, name: 'RepoIF' },
      to: [{ email: to, name: teacherName }],
      subject: `Nova entrega: ${assignmentTitle}`,
      htmlContent: this.buildEmailTemplate({
        heading: 'Nova entrega recebida 📥',
        bodyHtml: `
          <p style="margin:0 0 16px;">Olá <strong>${teacherName}</strong>,</p>
          <p style="margin:0 0 16px;">O aluno <strong>${studentName}</strong> entregou o trabalho <strong>${assignmentTitle}</strong> da disciplina <strong>${subjectName}</strong>.</p>
        `,
        button: { label: 'Ver entregas', url: link },
        footnote: 'Acesse o RepoIF para conferir as entregas dos alunos.',
      }),
    });
  }

  /**
   * Monta o HTML de um e-mail transacional com a identidade visual do RepoIF.
   * Usa estilos inline e layout em tabela para máxima compatibilidade entre
   * clientes de e-mail (Gmail, Outlook, etc.).
   */
  private buildEmailTemplate(params: {
    heading: string;
    bodyHtml: string;
    button: { label: string; url: string };
    footnote: string;
  }): string {
    const { heading, bodyHtml, button, footnote } = params;
    const brand = '#1A3FFF';
    const year = new Date().getFullYear();
    const logoUrl = this.configService.getOrThrow<string>('MAIL_LOGO_URL');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RepoIF</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; -webkit-font-smoothing:antialiased; font-family:'Space Grotesk','Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(10,14,26,0.08);">
          <!-- Cabeçalho com a marca -->
          <tr>
            <td align="center" style="background-color:${brand}; padding:28px 32px;">
              <img src="${logoUrl}" alt="RepoIF" height="40" style="display:block; height:40px; width:auto; border:0; outline:none; text-decoration:none;" />
            </td>
          </tr>
          <!-- Conteúdo -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 20px; font-size:22px; font-weight:600; color:#0a0e1a;">${heading}</h1>
              <div style="font-size:15px; line-height:1.6; color:#444b5a;">
                ${bodyHtml}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
                <tr>
                  <td align="center" style="border-radius:8px; background-color:${brand};">
                    <a href="${button.url}" target="_blank" style="display:inline-block; padding:13px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">${button.label}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px; font-size:13px; line-height:1.5; color:#8a92a6;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
              <p style="margin:0; font-size:13px; line-height:1.5; word-break:break-all;"><a href="${button.url}" target="_blank" style="color:${brand}; text-decoration:underline;">${button.url}</a></p>
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="padding:24px 32px; border-top:1px solid #eceef2;">
              <p style="margin:0 0 12px; font-size:13px; line-height:1.5; color:#8a92a6;">${footnote}</p>
              <p style="margin:0; font-size:12px; color:#aab0bd;">© ${year} RepoIF. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

}
