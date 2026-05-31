import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (toEmail, code) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'CalmSpace <onboarding@resend.dev>',     // ← Use this for now
      to: [toEmail],
      subject: 'CalmSpace — Your Verification Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#4f46e5">Welcome to CalmSpace 🌿</h2>
          <p>Use the code below to verify your email address:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#4f46e5;padding:16px 0">
            ${code}
          </div>
          <p style="color:#6b7280;font-size:14px">This code expires in 15 minutes.</p>
        </div>
      `,
    });

    if (error) throw error;

    console.log('✅ Email sent via Resend:', data.id);
    return data;

  } catch (err) {
    console.error('Resend failed:', err);
    throw err;
  }
};