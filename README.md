# ImageEditor
Image Background Remover

Keystone is a small, browser based tool for removing a plain background from
JPEG and PNG images. Open `index.html` in a modern browser to use it.

Use the menu to switch between background removal, shape-following borders, and
color replacement. Borders can have one to five colored outlines with a
custom line weight. In the color tool, sample multiple source colors, choose a
replacement for each, and adjust sensitivity to include more nearby shades.
Paste an image with Ctrl+V, or use the picker/drop area. A newly loaded image is
shown unchanged; click **Preview image** to apply the active tool. Switching
tools clears the current image, so load it again in the tool you want to use.

Choose an image or drop it into the upload area. The remover samples the image
corners to find a background color; use **Pick color** to sample another spot,
and adjust **Color tolerance** to refine the result. Download the transparent
result as a PNG, or copy it to the clipboard in browsers that support image
clipboard access.

Images are processed locally and are not uploaded. The color based remover is
best for solid or evenly colored backgrounds; it is not an AI cutout tool and
can struggle with busy backgrounds, shadows, or hair. Images over 16 megapixels
are not processed to avoid excessive browser memory use.
