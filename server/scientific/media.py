"""Place a verified local image without distorting it. Boxes use figure fractions."""
from PIL import Image


def place_image(fig, context, asset_id, box, fit="contain"):
    if fit not in ("contain", "cover"):
        raise ValueError("Image fit must be contain or cover")
    asset = context.get("assets", {}).get(asset_id)
    if not asset:
        raise ValueError(f"Missing normalized image asset: {asset_id}")
    x, y, width, height = box
    if width <= 0 or height <= 0:
        raise ValueError("Image box must have positive dimensions")
    with Image.open(asset["path"]) as source:
        pixels = source.convert("RGB")
    iw, ih = pixels.size
    target = width * fig.get_figwidth() / (height * fig.get_figheight())
    if fit == "contain":
        if iw / ih > target:
            new_height = height * target / (iw / ih)
            y += (height - new_height) / 2
            height = new_height
        else:
            new_width = width * (iw / ih) / target
            x += (width - new_width) / 2
            width = new_width
    ax = fig.add_axes([x, y, width, height])
    artist = ax.imshow(pixels, aspect="auto")
    ax.set_axis_off()
    if fit == "cover":
        if iw / ih > target:
            crop = ih * target
            ax.set_xlim((iw - crop) / 2, (iw + crop) / 2)
        else:
            crop = iw / target
            ax.set_ylim((ih + crop) / 2, (ih - crop) / 2)
    return ax, artist
