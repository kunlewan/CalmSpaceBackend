import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const OAuth2 = google.auth.OAuth2;

export const sendReceiptEmail = async (toEmail) => {
  const oauth2Client = new OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
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

  // Generate a random mock invoice number for authenticity
  const invoiceNumber = 'REN-' + Math.floor(100000 + Math.random() * 900000);
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const result = await transporter.sendMail({
    from:    `"Render Billing" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: `Invoice ${invoiceNumber} from Render`,
    text:    `Thank you for your payment! Your hosting payment of $20.00 was successful. Invoice: ${invoiceNumber}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 40px 20px; background-color: #fafafa; color: #111827;">
        
        <!-- Header / Logo -->
        <div style="margin-bottom: 32px; text-align: left;">
          <h2 style="color: #4642f5; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">render</h2>
        </div>

        <!-- Success Badge -->
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);">
          
          <div style="display: inline-block; background-color: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px;">
            Payment Successful
          </div>

          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #111827;">Thanks for your payment</h1>
          <p style="font-size: 15px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.5;">
            We've processed your payment for your Render web hosting subscription. A summary of your transaction details is below.
          </p>

          <!-- Metadata Grid -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Invoice Number</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 500; color: #111827;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Date Paid</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 500; color: #111827;">${currentDate}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Payment Method</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 500; color: #111827;">Card ending in •••• 4242</td>
            </tr>
          </table>

          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

          <!-- Line Items -->
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="color: #6b7280; font-weight: 500;">
                <th style="text-align: left; padding-bottom: 12px;">Description</th>
                <th style="text-align: right; padding-bottom: 12px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 12px 0; color: #111827; font-weight: 500;">
                  Render Web Service — Individual Plan
                  <div style="font-size: 12px; color: #6b7280; font-weight: 400; margin-top: 2px;">Monthly hosting usage & bandwidth</div>
                </td>
                <td style="padding: 12px 0; text-align: right; color: #111827; font-weight: 500; vertical-align: top;">$20.00</td>
              </tr>
              
              <!-- Total Row -->
              <tr style="border-top: 1px solid #e5e7eb;">
                <td style="padding: 18px 0 0 0; font-weight: 700; color: #111827; font-size: 16px;">Total Paid</td>
                <td style="padding: 18px 0 0 0; text-align: right; font-weight: 700; color: #4642f5; font-size: 18px;">$20.00</td>
              </tr>
            </tbody>
          </table>

        </div>

        <!-- Footer -->
        <div style="margin-top: 32px; text-align: center; font-size: 12px; color: #9ca3af; line-height: 1.5;">
          <p style="margin: 0 0 8px 0;">Render Services, Inc. • 548 Market St, San Francisco, CA 94104</p>
          <p style="margin: 0;">If you have any questions about this charge, please contact <a href="mailto:billing@render.com" style="color: #4642f5; text-decoration: none;">billing@render.com</a>.</p>
        </div>

      </div>
    `,
  });

  console.log('✅ Receipt email sent successfully:', result.messageId);
  return result;
};