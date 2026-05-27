const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

async function generatePDF() {
    console.log("Starting Curated Screenshot-to-PDF pipeline...");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Exact 16:9 HD viewport
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    const filePath = 'file://' + path.join(__dirname, 'index.html');
    await page.goto(filePath, { waitUntil: 'networkidle0' });

    // Disable fade-in and slide change animations to ensure crisp screenshots immediately
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            * {
                animation: none !important;
                transition: none !important;
            }
        `;
        document.head.appendChild(style);
    });

    await new Promise(r => setTimeout(r, 1000));

    const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
    console.log(`Found ${slideCount} slides.`);

    const pdfDoc = await PDFDocument.create();

    const tempDir = path.join(__dirname, 'screenshots_temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    for (let i = 0; i < slideCount; i++) {
        await page.evaluate((index) => {
            window.location.hash = '#' + (index + 1);
        }, i);

        // Small delay to allow layout recalculation/rendering
        await new Promise(r => setTimeout(r, 150));

        const screenshotPath = path.join(tempDir, `slide_${String(i + 1).padStart(3, '0')}.png`);

        await page.screenshot({
            path: screenshotPath,
            type: 'png'
        });

        if ((i + 1) % 10 === 0 || i + 1 === slideCount) {
            console.log(`Captured slide ${i + 1}/${slideCount}`);
        }

        const imgBytes = fs.readFileSync(screenshotPath);
        const img = await pdfDoc.embedPng(imgBytes);

        const pageAdded = pdfDoc.addPage([1920, 1080]);
        pageAdded.drawImage(img, {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080
        });

        fs.unlinkSync(screenshotPath); // Delete immediately to keep disk clean
    }

    console.log("Saving PDF...");
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(path.join(__dirname, 'MongoDB_Lecture.pdf'), pdfBytes);

    // Clean up temp directory
    try {
        fs.rmdirSync(tempDir);
    } catch (e) {
        console.warn("Could not delete temp directory:", e.message);
    }

    console.log("PDF generation complete: MongoDB_Lecture.pdf");
    await browser.close();
}

generatePDF().catch(console.error);
