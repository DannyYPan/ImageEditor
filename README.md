# ImageEditor
Image Background Remover

Keystone is a browser based image editor and converter. Open `index.html` in a
modern browser to use it. Effects apply automatically after an image loads.

Use the menu to switch between background removal, shape-following borders, and
color replacement. Borders can have one to five colored outlines with a
custom line weight. In the color tool, sample multiple source colors, choose a
replacement for each, and adjust sensitivity to include more nearby shades.
Paste an image with Ctrl+V, or use the picker/drop area. The before/after
slider compares your original with the edited result. Switching tools clears
the current image, so load it again in the tool you want to use.

The crop tool supports common aspect ratios, a custom ratio, and editable crop
dimensions and position. Export the result as PNG, JPG, WebP, SVG, or PDF. You
can also load a PDF and convert its first page to an image format; this uses
PDF.js from a CDN and needs an internet connection.

Choose an image or drop it into the upload area. The remover samples the image
corners to find a background color; use **Pick color** to sample another spot,
and adjust **Color tolerance** to refine the result. Copy the edited result as
a PNG in browsers that support image clipboard access.

Images are processed locally and are not uploaded. The color based remover is
best for solid or evenly colored backgrounds; it is not an AI cutout tool and
can struggle with busy backgrounds, shadows, or hair. Images over 16 megapixels
are not processed to avoid excessive browser memory use.

Branding is set in the project code and assets, not through an editor control.
Change the title and logo markup in `index.html`, and replace or update
`assets/favicon.svg` to change the favicon for everyone using the project.

The interface palette uses navy `#0e103d` with pale pink `#f2d7ee` highlights
and text.
