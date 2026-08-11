const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const db = require("./database");

const app = express();

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Use EJS
app.set("view engine", "ejs");

// Static folders
app.use(express.static("public"));
app.use("/uploads", express.static(uploadDir));

// Read form data
app.use(express.urlencoded({ extended: true }));

// Multer setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Home page
app.get("/", (req, res) => {
    res.render("index");
});

// Upload page
app.get("/upload", (req, res) => {
    res.render("upload");
});

// Gallery page (with search functionality)
app.get("/gallery", (req, res) => {
    const search = req.query.search || "";

    const sql = "SELECT * FROM images WHERE name LIKE ? OR idNumber LIKE ? ORDER BY id DESC";

    db.all(sql, ["%" + search + "%", "%" + search + "%"], (err, rows) => {
        if (err) {
            return res.status(500).send("Database Error");
        }

        res.render("gallery", {
            images: rows,
            search: search
        });
    });
});

// Delete image route
app.post("/delete/:id", (req, res) => {
    const id = req.params.id;

    // 1. Get image info from database to find file path
    db.get("SELECT * FROM images WHERE id = ?", [id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database Error");
        }

        if (!row) {
            return res.redirect("/gallery");
        }

        // 2. Delete the physical image file from uploads folder correctly
        const filePath = path.join(uploadDir, path.basename(row.image));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // 3. Delete record from database
        db.run("DELETE FROM images WHERE id = ?", [id], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Database Error");
            }

            // 4. Redirect back to gallery
            res.redirect("/gallery");
        });
    });
});

// Show only the uploaded image when QR is scanned
app.get("/image/:id", (req, res) => {
    const id = req.params.id;

    db.get(
        "SELECT * FROM images WHERE id = ?",
        [id],
        (err, row) => {
            if (err) {
                return res.status(500).send("Database Error");
            }

            if (!row) {
                return res.status(404).send("Image not found");
            }

            const htmlResponse = '<!DOCTYPE html>' +
            '<html>' +
            '<head>' +
            '    <title>Image</title>' +
            '    <style>' +
            '        body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#f5f5f5;}' +
            '        img{max-width:95%;max-height:95%;}' +
            '    </style>' +
            '</head>' +
            '<body>' +
            '    <img src="' + row.image + '">' +
            '</body>' +
            '</html>';

            res.send(htmlResponse);
        }
    );
});

// Upload image and generate QR
app.post("/upload", upload.single("image"), (req, res) => {

    if (!req.file) {
        return res.status(400).send("No file uploaded.");
    }

    const name = req.body.name;
    const idNumber = req.body.idNumber;

    // Save image path
    const imageURL = '/uploads/' + req.file.filename;

    db.run(
        "INSERT INTO images (name, idNumber, image, qr) VALUES (?, ?, ?, ?)",
        [name, idNumber, imageURL, ""],
        async function (err) {if (err) {
                console.error(err);
                return res.status(500).send("Database Error");
            }

            const imageId = this.lastID;

            console.log("==============================");
            console.log("Image saved successfully!");
            console.log("Database ID:", imageId);
            console.log("Name:", name);
            console.log("ID Number:", idNumber);
            console.log("Image:", imageURL);
            console.log("==============================");

            // QR points to image page
            const qrLink = 'http://localhost:3000/image/' + imageId;

            const qrCode = await QRCode.toDataURL(qrLink);

            // Save QR into database
            db.run(
                "UPDATE images SET qr = ? WHERE id = ?",
                [qrCode, imageId]
            );

            res.render("result", {
                name,
                idNumber,
                image: imageURL,
                qr: qrCode
            });

        }
    );

});

// Start server
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});