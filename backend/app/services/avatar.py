"""Profile picture handling: verify it is a real image, shrink it, re-encode it."""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from .auth import AuthError

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # what we accept from the browser
AVATAR_SIZE = 256  # what we store: at most 256x256 pixels
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 25_000_000  # refuse "decompression bomb" images


def process_avatar(raw: bytes) -> tuple[bytes, str]:
    """Return (image bytes, content type). Raises AuthError(400/413) for bad uploads."""
    if len(raw) > MAX_UPLOAD_BYTES:
        raise AuthError(413, "avatar_too_large", "Image is too large. Maximum size is 2 MB.")
    try:
        with Image.open(io.BytesIO(raw)) as img:
            if img.format not in ALLOWED_FORMATS:
                raise AuthError(400, "avatar_invalid", "Please upload a PNG, JPEG or WebP image.")
            img = ImageOps.exif_transpose(img)  # respect phone-camera rotation
            img = ImageOps.fit(img.convert("RGBA"), (AVATAR_SIZE, AVATAR_SIZE))  # centered square crop
            out = io.BytesIO()
            img.save(out, format="WEBP", quality=85)  # re-encoding also strips metadata (EXIF/GPS)
    except AuthError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise AuthError(400, "avatar_invalid", "That file is not a valid image.") from exc
    return out.getvalue(), "image/webp"
