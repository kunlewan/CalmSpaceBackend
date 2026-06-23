import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const OAuth2 = google.auth.OAuth2;

export const sendVerificationEmail = async (toEmail, code) => {
  const redirectUri = process.env.OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';
  const oauth2Client = new OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
  });

  const accessToken = await new Promise((resolve, reject) => {
    oauth2Client.getAccessToken((err, token) => {
      if (err) reject(new Error('Failed to create access token'));
      else resolve(token);
    });
  });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type:         'OAuth2',
      user:         process.env.EMAIL_USER,
      clientId:     process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN,
      accessToken,
    },
  });

  const result = await transporter.sendMail({
    from:    `"CalmSpace" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: 'CalmSpace — Your Verification Code',
    text:    `Your verification code is: ${code}\n\nThis code expires in 15 minutes.`,
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

  console.log('✅ Verification email sent:', result.messageId);
  return result;
};


// import nodemailer from 'nodemailer';

// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.GMAIL_APP_PASSWORD,
//   },
// });

// export const sendVerificationEmail = async (toEmail, code) => {
//   const result = await transporter.sendMail({
//     from:    `"CalmSpace" <${process.env.EMAIL_USER}>`,
//     to:      toEmail,
//     subject: 'CalmSpace — Your Verification Code',
//     html: `
//       <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
//         <h2 style="color:#4f46e5">Welcome to CalmSpace 🌿</h2>
//         <p>Use the code below to verify your email address:</p>
//         <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#4f46e5;padding:16px 0">
//           ${code}
//         </div>
//         <p style="color:#6b7280;font-size:14px">This code expires in 15 minutes.</p>
//       </div>
//     `,
//   });

//   console.log('✅ Verification email sent:', result.messageId);
//   return result;
// };