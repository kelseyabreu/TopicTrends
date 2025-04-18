import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

# Set up logger
logger = logging.getLogger(__name__)

# Environment variables
APP_ENV = os.environ.get("APP_ENV", "development")
DEV_MODE = APP_ENV.lower() == "development"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# SendGrid configuration
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", "noreply@topictrends.app")
SENDGRID_FROM_NAME = os.environ.get("SENDGRID_FROM_NAME", "TopicTrends")

# SendGrid SMTP settings
SMTP_SERVER = "smtp.sendgrid.net"
SMTP_PORT = 587
SMTP_USERNAME = "apikey"  # This is always "apikey" for SendGrid
SMTP_PASSWORD = SENDGRID_API_KEY  # Your SendGrid API key

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email with HTML content using SendGrid"""
    # Log the email attempt
    logger.info(f"Preparing to send email to: {to_email}")
    
    # In development mode with no API key, just log and return success
    if DEV_MODE and not SENDGRID_API_KEY:
        logger.info("DEV MODE: No SendGrid API key found. Skipping actual email sending.")
        logger.info(f"Email content: {html_content[:100]}...")  # Log just the beginning
        return True
    
    # Create message
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{SENDGRID_FROM_NAME} <{SENDGRID_FROM_EMAIL}>"
    message["To"] = to_email
    
    # Create HTML content
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)
    
    try:
        # Create SMTP session
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SENDGRID_FROM_EMAIL, to_email, message.as_string())
            
        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        # In development, we can be more forgiving
        if DEV_MODE:
            logger.warning("DEV MODE: Email sending failed, but continuing anyway")
            return True
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
    
    # Always log the verification code in any environment
    logger.info(f"Verification code for {to_email}: {verification_code}")
    logger.info(f"Verification URL: {verification_url}")
    
    # Send the email
    return await send_email(to_email, subject, html_content)