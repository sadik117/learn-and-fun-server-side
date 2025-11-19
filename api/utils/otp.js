const { getDb } = require('./db');

async function storeOtp(email, otp) {
  const db = await getDb();
  const otpColl = db.collection('otps');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await otpColl.updateOne(
    { email },
    { $set: { otp, expiresAt } },
    { upsert: true }
  );
}

async function verifyOtpDb(email, otp) {
  const db = await getDb();
  const otpColl = db.collection('otps');
  const record = await otpColl.findOne({ email });
  if (!record) return { valid: false, message: 'No OTP sent' };
  if (record.expiresAt < new Date()) {
    await otpColl.deleteOne({ email });
    return { valid: false, message: 'OTP expired' };
  }
  if (record.otp !== otp) return { valid: false, message: 'Invalid OTP' };
  await otpColl.deleteOne({ email });
  return { valid: true };
}

module.exports = { storeOtp, verifyOtpDb };
