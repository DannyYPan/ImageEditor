# Optica Studio
Browser-based image editor

Optica Studio is a browser-based image editor and converter. Open `index.html` in a
modern browser to use it. Effects apply automatically after an image loads.

Use the menu to switch among background removal, shape-following borders, color
replacement, cropping, resizing, and format conversion. Borders can have one to five colored outlines, each with its own thickness. In the color tool, sample multiple source colors, choose a
replacement for each, and adjust sensitivity to include more nearby shades.
Paste an image with Ctrl+V, or use the picker/drop area. The Before/After
toggle crossfades between your original and edited result. Switching tools clears
the current image, so load it again in the tool you want to use.
Use the preview zoom controls to magnify details, drag the zoomed image to pan,
and choose **Fit** to return to the full preview. Zoom does not change exports.

The crop tool supports common aspect ratios and a custom ratio. Drag the crop
frame to choose the part of the photo to keep, and drag its corner to resize.
For free crop, enter exact width and height values in the crop controls.
The resize tool accepts exact output dimensions, can lock the aspect ratio, and
offers high-quality smoothing for resized images. Output is limited to 16
megapixels to keep browser memory use manageable.
Export the result as PNG, JPG, WebP, SVG, or PDF. In the format converter,
use the page slider to inspect each PDF page; exporting converts every page into
a separate image in a ZIP archive. PDF.js is loaded from a CDN and needs an
internet connection.

Choose an image or drop it into the upload area. The remover samples the image
corners to find a background color; use **Pick color** to sample another spot,
and adjust **Color tolerance** to refine the result. Copy the edited result as
a PNG in browsers that support image clipboard access.

Images are processed locally and are not uploaded. The color based remover is
best for solid or evenly colored backgrounds; it is not an AI cutout tool and
can struggle with busy backgrounds, shadows, or hair. Images over 16 megapixels
are not processed to avoid excessive browser memory use.

Branding is set in the project code and assets, not through an editor control.
The header logo and favicon are `assets/logo.png` and `assets/favicon.png`.
Replace those PNGs to change the site branding for everyone using the project;
the Optica Studio wordmark and page title are in `index.html`.

The interface uses a white, black, and sunshine yellow palette with a subtle
dot grid in the page background.
