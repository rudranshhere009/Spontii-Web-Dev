import nodemailer from 'nodemailer'

let transporter

function getTransporter() {
  if (!transporter) {
    const user = process.env.MAIL_USER
    const pass = process.env.MAIL_APP_PASSWORD

    if (!user || !pass) {
      throw new Error('Set MAIL_USER and MAIL_APP_PASSWORD in server/.env.')
    }

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
  }

  return transporter
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ))
}

function otpEmailHtml({ name, otp, minutes }) {
  const firstName = escapeHtml(name.trim().split(/\s+/)[0] || 'there')
  const digits = otp
    .split('')
    .map(
      (digit) =>
        `<td style="width:46px;height:58px;background:#0b0a14;border:1px solid #2b2840;border-radius:12px;text-align:center;font-size:28px;font-weight:800;color:#3eebae;font-family:'Segoe UI',Arial,sans-serif;">${digit}</td><td style="width:8px;"></td>`,
    )
    .join('')

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0b0a14;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Spontii verification code is ${otp}. It expires in ${minutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a14;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#15131f;border:1px solid #2b2840;border-radius:20px;font-family:'Segoe UI',Arial,sans-serif;color:#f4f3fa;">
        <tr><td style="padding:32px 32px 0;text-align:center;">
          <div style="font-size:30px;font-weight:800;font-style:italic;letter-spacing:-0.5px;color:#3eebae;">spontii</div>
          <div style="margin-top:6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8d89a8;">Real people. Real plans.</div>
        </td></tr>

        <tr><td style="padding:28px 32px 0;text-align:center;">
          <div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#3eebae;">Verify your email</div>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;font-weight:800;color:#ffffff;">Hi ${firstName}, welcome to Spontii 👋</h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#b7b4cc;">
            Spontii helps you discover spontaneous plans near you and meet people who share your vibe.
            You're one step away: enter the code below to confirm your email and create your account.
          </p>
        </td></tr>

        <tr><td align="center" style="padding:28px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
        </td></tr>

        <tr><td style="padding:22px 32px 0;text-align:center;">
          <div style="display:inline-block;padding:8px 16px;border-radius:999px;background:#142922;color:#3eebae;font-size:13px;font-weight:700;">
            ⏱ Valid for ${minutes} minutes
          </div>
        </td></tr>

        <tr><td style="padding:28px 32px 0;">
          <div style="padding:16px 18px;border-radius:14px;background:#1d1a2b;border:1px solid #2b2840;font-size:13px;line-height:1.6;color:#b7b4cc;">
            🔒 <strong style="color:#ffffff;">Never share this code with anyone.</strong>
            The Spontii team will never ask you for it, by email, call or chat.
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 32px;text-align:center;font-size:12px;line-height:1.6;color:#7b7794;">
          Didn't try to sign up? You can safely ignore this email, and no account will be created.
          <br /><br />© Spontii · Made for spontaneous people
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendOtpEmail({ to, name, otp, minutes }) {
  const fromName = process.env.MAIL_FROM_NAME || 'Spontii'

  await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.MAIL_USER}>`,
    to,
    subject: `${otp} is your Spontii verification code`,
    text:
      `Hi ${name},\n\nWelcome to Spontii! Your verification code is ${otp}.\n` +
      `It is valid for ${minutes} minutes.\n\n` +
      `Never share this code with anyone. Spontii will never ask for it.\n` +
      `If you didn't try to sign up, you can ignore this email.`,
    html: otpEmailHtml({ name, otp, minutes }),
  })
}