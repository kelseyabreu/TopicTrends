import os
import smtplib
import ssl # Import the ssl module
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

# Set up logger
logger = logging.getLogger(__name__)

# Environment variables
APP_ENV = os.environ.get("APP_ENV", "development")
DEV_MODE = APP_ENV.lower() == "development"
VITE_CLIENT_URL = os.environ.get("VITE_CLIENT_URL", "http://localhost:5173")

# --- Gmail SMTP Configuration (Using App Password) ---
# !! IMPORTANT: Set these environment variables in your system !! (already done in .env file)
# Example:
# instead of export use setx GMAIL_SENDER_EMAIL "sorakh2756@gmail.com" for windows
# export GMAIL_SENDER_EMAIL='sorakh2756@gmail.com'
# export GMAIL_APP_PASSWORD='azktsjaohgvppdxo'
# export EMAIL_FROM_NAME='TopicTrends'

# Your full Gmail address (the account you enabled 2SV and generated the App Password for)
GMAIL_SENDER_EMAIL = os.environ.get("GMAIL_SENDER_EMAIL")
# The 16-digit App Password you generated
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
# Optional: Name to display in the "From" field
FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "TopicTrends") # You can customize this

# Gmail SMTP settings
SMTP_SERVER = "smtp.gmail.com"
# Use port 465 for SSL (simpler setup) or 587 for TLS/STARTTLS
SMTP_PORT = 465 # Recommended for simplicity with SMTP_SSL
# SMTP_PORT = 587 # Alternative: Use this if you prefer STARTTLS below

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email with HTML content using Gmail SMTP and App Password"""
    logger.info(f"Preparing to send email via Gmail to: {to_email}")

    # Check if Gmail credentials are configured
    if not GMAIL_SENDER_EMAIL or not GMAIL_APP_PASSWORD:
        logger.error("Gmail sender email or App Password not configured in environment variables.")
        # In development, maybe allow skipping, otherwise fail
        if DEV_MODE:
            logger.warning("DEV MODE: Gmail credentials missing. Skipping actual email sending.")
            logger.info(f"Email content (dev preview): {html_content[:100]}...")
            return True # Or False depending on desired dev behavior
        return False

    # Create message
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    # Format the "From" header nicely - MUST use GMAIL_SENDER_EMAIL here
    message["From"] = f"{FROM_NAME} <{GMAIL_SENDER_EMAIL}>"
    message["To"] = to_email

    # Attach HTML content
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)

    # Create a secure SSL context
    context = ssl.create_default_context()

    try:
        # --- Option 1: Using Port 465 (SSL) --- Recommended for simplicity
        if SMTP_PORT == 465:
            logger.info(f"Connecting to {SMTP_SERVER} on port {SMTP_PORT} using SSL...")
            with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
                logger.info(f"Logging in as {GMAIL_SENDER_EMAIL}...")
                server.login(GMAIL_SENDER_EMAIL, GMAIL_APP_PASSWORD)
                logger.info(f"Sending email to {to_email}...")
                # Use GMAIL_SENDER_EMAIL as the 'from_addr' argument
                server.sendmail(GMAIL_SENDER_EMAIL, to_email, message.as_string())

        # --- Option 2: Using Port 587 (TLS/STARTTLS) ---
        elif SMTP_PORT == 587:
            logger.info(f"Connecting to {SMTP_SERVER} on port {SMTP_PORT}...")
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                logger.info("Starting TLS...")
                server.starttls(context=context) # Secure the connection
                logger.info(f"Logging in as {GMAIL_SENDER_EMAIL}...")
                server.login(GMAIL_SENDER_EMAIL, GMAIL_APP_PASSWORD)
                logger.info(f"Sending email to {to_email}...")
                 # Use GMAIL_SENDER_EMAIL as the 'from_addr' argument
                server.sendmail(GMAIL_SENDER_EMAIL, to_email, message.as_string())
        else:
             logger.error(f"Unsupported SMTP port configured: {SMTP_PORT}")
             return False

        logger.info(f"Email sent successfully to {to_email} via Gmail.")
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error(f"Gmail SMTP authentication failed for {GMAIL_SENDER_EMAIL}.")
        logger.error("Check if GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD environment variables are correct.")
        logger.error("Ensure 2-Step Verification is ON and the App Password is valid.")
        logger.error("Make sure you are using the 16-digit App Password, NOT your main Google password.")
        return False
    except smtplib.SMTPConnectError as e:
        logger.error(f"Failed to connect to Gmail SMTP server {SMTP_SERVER}:{SMTP_PORT}. Error: {e}")
        logger.error("Check network connectivity and firewall rules.")
        return False
    except Exception as e:
        logger.exception(f"An unexpected error occurred while sending email: {str(e)}") # Use logger.exception to include traceback
        # # Optional: Be more forgiving in development
        # if DEV_MODE:
        #     logger.warning("DEV MODE: Email sending failed, but continuing anyway")
        #     return True
        return False

async def send_verification_email(to_email: str, username: str, verification_code: str):
    """Send verification email with code (uses the configured send_email function)"""
    subject = "Verify Your Email - TopicTrends" # Or your app name

    # Create verification URL
    verification_url = f"{VITE_CLIENT_URL}/verify?email={to_email}&code={verification_code}"

    # Use the same HTML content structure
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

    # Log verification details (good for debugging)
    logger.info(f"Verification code for {to_email}: {verification_code}")
    logger.info(f"Verification URL: {verification_url}")

    # Send the email using the updated send_email function
    return await send_email(to_email, subject, html_content)