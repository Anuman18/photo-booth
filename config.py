import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "photobooth-secret-2026")
    DEBUG = os.environ.get("DEBUG", "true").lower() == "true"

    STATIC_FOLDER  = os.path.join(BASE_DIR, "static")
    LAYOUTS_FOLDER = os.path.join(STATIC_FOLDER, "layouts")
    OUTPUTS_FOLDER = os.path.join(STATIC_FOLDER, "outputs")
    QRCODES_FOLDER = os.path.join(STATIC_FOLDER, "qrcodes")

    LAYOUT_TOP    = os.path.join(LAYOUTS_FOLDER, "layout_top.png")
    LAYOUT_BOTTOM = os.path.join(LAYOUTS_FOLDER, "layout_bottom.png")

    OUTPUT_WIDTH   = 1024
    PHOTO_HEIGHT   = 840
    OUTPUT_FORMAT  = "PNG"
    OUTPUT_QUALITY = 95

    QR_BOX_SIZE = 10
    QR_BORDER   = 4

    @staticmethod
    def init_app(app):
        os.makedirs(Config.OUTPUTS_FOLDER, exist_ok=True)
        os.makedirs(Config.QRCODES_FOLDER, exist_ok=True)