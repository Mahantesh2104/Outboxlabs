const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

async function generateEtherealCredentials() {
  console.log('Generating new Ethereal Email test account...');
  const testAccount = await nodemailer.createTestAccount();

  console.log('\n======================================================');
  console.log('Ethereal Email Test Account Created Successfully!');
  console.log('======================================================');
  console.log(`SMTP Host : ${testAccount.smtp.host}`);
  console.log(`SMTP Port : ${testAccount.smtp.port}`);
  console.log(`Username  : ${testAccount.user}`);
  console.log(`Password  : ${testAccount.pass}`);
  console.log(`Web Login : https://ethereal.email/login`);
  console.log('======================================================\n');

  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent
      .replace(/^ETHEREAL_USER=.*$/m, `ETHEREAL_USER=${testAccount.user}`)
      .replace(/^ETHEREAL_PASS=.*$/m, `ETHEREAL_PASS=${testAccount.pass}`);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`Updated ${envPath} with new ETHEREAL_USER and ETHEREAL_PASS.`);
  } else {
    console.log('Copy the following lines into your backend/.env file:');
    console.log(`ETHEREAL_USER=${testAccount.user}`);
    console.log(`ETHEREAL_PASS=${testAccount.pass}`);
  }
}

generateEtherealCredentials().catch((err) => {
  console.error('Failed to generate Ethereal credentials:', err);
  process.exit(1);
});
