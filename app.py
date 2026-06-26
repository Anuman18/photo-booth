import os
import uuid
import base64
import logging
from io import BytesIO
from datetime import datetime

import qrcode
from PIL import Image

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    send_from_directory,
    url_for
)

from flask_cors import CORS

from config import Config

# -------------------------------------------------
# Flask App
# -------------------------------------------------

app = Flask(__name__)

app.config.from_object(Config)
Config.init_app(app)

CORS(
    app,
    resources={
        r"/*": {
            "origins": [
                "https://seagullventure.com",
                "https://www.seagullventure.com"
            ]
        }
    },
    supports_credentials=True
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/layouts/<name>")
def layout_image(name):
    allowed = {"layout_top.png", "layout_bottom.png"}
    if name not in allowed:
        return "Not found", 404
    return send_from_directory(Config.LAYOUTS_FOLDER, name, mimetype="image/png")


@app.route("/capture", methods=["POST"])
def capture():
    try:
        data = request.get_json(force=True)
        if not data or "image" not in data:
            return jsonify({"error": "No image data received"}), 400

        image_b64 = data["image"]
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        raw_bytes = base64.b64decode(image_b64)
        photo = Image.open(BytesIO(raw_bytes)).convert("RGB")

        layout_top = Image.open(Config.LAYOUT_TOP).convert("RGBA")
        layout_bottom = Image.open(Config.LAYOUT_BOTTOM).convert("RGBA")

        W = Config.OUTPUT_WIDTH
        
        # PROPERLY SCALE LAYOUTS TO MATCH OUTPUT WIDTH
        if layout_top.width != W:
            t_ratio = W / layout_top.width
            layout_top = layout_top.resize((W, int(layout_top.height * t_ratio)), Image.LANCZOS)
            
        if layout_bottom.width != W:
            b_ratio = W / layout_bottom.width
            layout_bottom = layout_bottom.resize((W, int(layout_bottom.height * b_ratio)), Image.LANCZOS)

        top_h = layout_top.height
        bottom_h = layout_bottom.height
        photo_h = Config.PHOTO_HEIGHT
        total_h = top_h + photo_h + bottom_h

        photo_aspect = photo.width / photo.height
        slot_aspect = W / photo_h

        if photo_aspect > slot_aspect:
            scale_h = photo_h
            scale_w = int(photo_aspect * scale_h)
        else:
            scale_w = W
            scale_h = int(scale_w / photo_aspect)

        photo = photo.resize((scale_w, scale_h), Image.LANCZOS)
        left = (scale_w - W) // 2
        top_crop = (scale_h - photo_h) // 2
        photo = photo.crop((left, top_crop, left + W, top_crop + photo_h))

        final = Image.new("RGBA", (W, total_h), (255, 255, 255, 255))
        final.paste(layout_top, (0, 0))
        final.paste(photo.convert("RGBA"), (0, top_h))
        final.paste(layout_bottom, (0, top_h + photo_h), mask=layout_bottom)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        filename = f"photo_{timestamp}_{unique_id}.png"
        output_path = os.path.join(Config.OUTPUTS_FOLDER, filename)
        final.convert("RGB").save(output_path, "PNG", optimize=True)
        
        logger.info("=" * 60)
        logger.info("IMAGE SAVED SUCCESSFULLY")
        logger.info(f"Path      : {output_path}")
        logger.info(f"Exists    : {os.path.exists(output_path)}")
        logger.info(f"Size      : {os.path.getsize(output_path)} bytes")
        logger.info("=" * 60)
        
        download_url = url_for("download_file", filename=filename, _external=True)
        qr_filename = f"qr_{unique_id}.png"
        qr_path = os.path.join(Config.QRCODES_FOLDER, qr_filename)

        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
        qr.add_data(download_url)
        qr.make(fit=True)
        qr.make_image(fill_color="#1a1a1a", back_color="white").save(qr_path)
        
        logger.info("=" * 60)
        logger.info("QR GENERATED SUCCESSFULLY")
        logger.info(f"QR Path : {qr_path}")
        logger.info(f"Exists  : {os.path.exists(qr_path)}")
        logger.info("=" * 60)

        return jsonify({
            "success": True,
            "filename": filename,
            "photo_url": url_for("static", filename=f"outputs/{filename}"),
            "download_url": download_url,
            "qr_url": url_for("static", filename=f"qrcodes/{qr_filename}"),
        })

    except Exception as exc:
        logger.exception("Capture error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/download/<filename>")
def download_file(filename):
    return send_from_directory(Config.OUTPUTS_FOLDER, filename, as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)