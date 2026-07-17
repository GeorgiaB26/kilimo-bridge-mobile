/** Pilot SMS stub — logs messages until Safaricom/Twilio is wired. */
export function sendSms(phone: string, message: string): { sent: boolean; pilot: boolean } {
  const pilot = process.env.PILOT_OTP === 'true' || process.env.NODE_ENV !== 'production';
  console.log(`[SMS${pilot ? ' pilot' : ''}] ${phone}: ${message}`);
  return { sent: true, pilot };
}
