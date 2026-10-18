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

Use **Brand** in the header to change the displayed title and upload PNGs for
the logo and favicon. Those choices are saved in the current browser. To write
the uploaded images into the project, choose **Save PNGs to assets folder** and
select the project folder; the files are saved as `assets/logo.png` and
`assets/favicon.png`. Folder writing is available in browsers that support the
File System Access API. Replace `assets/favicon.svg` or point the page at your
own files when changing the default project branding for every visitor.

The interface palette uses navy `#0e103d` with pale pink `#f2d7ee` highlights
and text.
