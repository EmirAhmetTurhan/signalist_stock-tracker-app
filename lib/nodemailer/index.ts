import nodemailer from "nodemailer";
import {NEWS_SUMMARY_EMAIL_TEMPLATE, WELCOME_EMAIL_TEMPLATE, STOCK_ALERT_UPPER_EMAIL_TEMPLATE, STOCK_ALERT_LOWER_EMAIL_TEMPLATE} from "@/lib/nodemailer/templates";

export const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.NODEMAILER_EMAIL!,
        pass: process.env.NODEMAILER_PASSWORD!,
    }
})

export const sendWelcomeEmail = async ({email, name, intro}: WelcomeEmailData) => {
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE
        .replace('{{name}}', name)
        .replace('{{intro}}', intro);

    const mailOptions = {
        from: '"Signalist" <signalist@jsmastery.pro>',
        to: email,
        subject: 'Welcome to Signalist - your stock market toolkit is ready!',
        text: 'Thanks for joining Signalist',
        html: htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}

export const sendNewsSummaryEmail = async (
    { email, date, newsContent }: { email: string; date: string; newsContent: string }
): Promise<void> => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replace('{{date}}', date)
        .replace('{{newsContent}}', newsContent);

    const mailOptions = {
        from: `"Signalist News" <signalist@jsmastery.pro>`,
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: `Today's market news summary from Signalist`,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
}

export const sendPriceAlertEmail = async ({
    email,
    symbol,
    company,
    currentPrice,
    threshold,
    type,
    timestamp,
}: {
    email: string;
    symbol: string;
    company: string;
    currentPrice: string;
    threshold: string;
    type: 'upper' | 'lower';
    timestamp: string;
}) => {
    const template = type === 'upper' ? STOCK_ALERT_UPPER_EMAIL_TEMPLATE : STOCK_ALERT_LOWER_EMAIL_TEMPLATE;
    const htmlTemplate = template
        .replace(/\{\{symbol\}\}/g, symbol)
        .replace(/\{\{company\}\}/g, company)
        .replace(/\{\{currentPrice\}\}/g, currentPrice)
        .replace(/\{\{targetPrice\}\}/g, threshold)
        .replace(/\{\{timestamp\}\}/g, timestamp);

    const subject = type === 'upper' ? `🔔 ${symbol} Price Above Reached` : `🔔 ${symbol} Price Below Hit`;

    const mailOptions = {
        from: 'Signalist <signalist@jsmastery.pro>',
        to: email,
        subject,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
}

export const sendSmartAlertEmail = async ({
  email, name, symbol, conditions,
}: {
  email: string; name: string; symbol: string; conditions: string;
}) => {
  const mailOptions = {
    from: '"Signalist Smart Alerts" <signalist@jsmastery.pro>',
    to: email,
    subject: `🤖 Smart Alert Triggered: ${name} (${symbol})`,
    html: `<div style="background:#141414;color:#ccc;padding:24px;font-family:Arial">
      <h2 style="color:#fdd458">Smart Alert Triggered</h2>
      <h3 style="color:#fff">${name}</h3>
      <p><strong style="color:#fdd458">${symbol}</strong></p>
      <p style="color:#9095a1">Conditions: ${conditions}</p>
      <p style="color:#9095a1;margin-top:24px">All conditions were met based on the latest market data.</p>
      <a href="http://localhost:3000/watchlist" style="color:#fdd458">View your alerts →</a>
    </div>`,
  };
  await transporter.sendMail(mailOptions);
}
