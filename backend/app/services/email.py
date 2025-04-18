import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

# Email configuration
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_USERNAME = os.environ.get("EMAIL_USERNAME", "your-email@gmail.com")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "your-app-password")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "noreply@topictrends.app")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# Logger
logger = logging.getLogger(__name__)

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email with HTML content"""
    # Create message
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = EMAIL_FROM
    message["To"] = to_email
    
    # Create HTML content
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)
    
    try:
        # Create SMTP session
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(EMAIL_USERNAME, EMAIL_PASSWORD)
            server.sendmail(EMAIL_FROM, to_email, message.as_string())
            
        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        # In development, we'll just log the error
        # In production, you might want to implement a retry mechanism
        return False

async def send_verification_email(to_email: str, username: str, verification_code: str):
    """Send verification email with code"""
    subject = "Verify Your Email - TopicTrends"
    
    # Create verification URL
    verification_url = f"{FRONTEND_URL}/verify?email={to_email}&code={verification_code}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #3498db;">TopicTrends</h1>
        </div>
        <div style="background-color: #f9f9f9; border-radius: 5px; padding: 20px; margin-bottom: 20px;">
            <h2>Hello {username},</h2>
            <p>Thank you for registering with TopicTrends. To complete your registration, please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{verification_url}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
            </div>
            <p>Alternatively, you can enter this verification code on the verification page:</p>
            <div style="background-color: #eee; padding: 10px; text-align: center; font-size: 24px; letter-spacing: 5px; font-family: monospace; margin: 20px 0;">
                {verification_code}
            </div>
            <p>If you didn't register for TopicTrends, please ignore this email.</p>
        </div>
        <div style="text-align: center; font-size: 12px; color: #777;">
            <p>© 2025 TopicTrends. All rights reserved.</p>
        </div>
    </body>
    </html>
    """
    
    # During development, let's just log the verification code
    logger.info(f"Verification code for {to_email}: {verification_code}")
    logger.info(f"Verification URL: {verification_url}")
    
    # For local development, we might skip actual email sending
    if os.environ.get("APP_ENV") == "development":
        return True
    
    return await send_email(to_email, subject, html_content)
