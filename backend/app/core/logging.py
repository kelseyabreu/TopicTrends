# app/core/logging.py or similar
import logging
import sys

def setup_logger():
    # Configure the root logger
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )

    # Suppress specific noisy loggers
    logging.getLogger('passlib.handlers.bcrypt').setLevel(logging.ERROR)

# Call this function at application startup