const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const session = require("express-session");
const db = require("./database");

const app = express();

// ==============================
// BASIC SETTINGS
// ==============================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// ==============================
// SESSION / LOGIN
// ==============================

app.use(
    session({
        secret: "qr-image-manager-secret-change-this",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

// ==============================
// ADMIN LOGIN DETAILS
// ==============================

const ADMIN_USERNAME = "Qr-admin";
const ADMIN_PASSWORD = "My-Qr-Password123!";

// ==============================
// MULTER UPLOAD SETUP
// ==============================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);
        cb(null, Date.now() + extension);
    }
});

const upload = multer({ storage });

// ==============================
// LOGIN PROTECTION
// ==============================

function requireLogin(req, res, next) {
    if (req.session.loggedIn) {
        return next();
    }

    res.redirect("/login");
}

// ==============================
// LOGIN PAGE
// ==============================

app.get("/login", (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect("/gallery");
    }

    res.render("login", {
        error: null
    });
});

// ==============================
// HANDLE LOGIN
// ==============================

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === ADMIN_USERNAME &&
        password === ADMIN_PASSWORD
    ) {
        req.session.loggedIn = true;

        return res.redirect("/gallery");
    }

    res.render("login", {
        error: "Incorrect username or password."
    });
});

// ==============================
// LOGOUT
// ==============================

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// ==============================
// ADMIN HOME PAGE
// ==============================

app.get("/", requireLogin, (req, res) => {
    res.render("index");
});

// ==============================
// UPLOAD PAGE
// ==============================

app.get("/upload", requireLogin, (req, res) => {
    res.render("upload");
});

// ==============================
// HANDLE IMAGE UPLOAD
// ==============================

app.post(
    "/upload",
    requireLogin,
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).send("No file uploaded.");
            }

            const name = req.body.name;
            const idNumber = req.body.idNumber;
            const filename = req.file.filename;

            const imageURL = "/uploads/" + filename;

            // Save image information to database
            db.run(
                "INSERT INTO images (name, idNumber, image, qr) VALUES (?, ?, ?, ?)",
                [name, idNumber, imageURL, ""],
                async function (err) {
                    if (err) {
                        console.error("Database error:", err);
                        return res.status(500).send("Database Error");
                    }

                    const imageId = this.lastID;

                    // Public URL for QR Code
                    const qrLink = "https://qr-image-manager.onrender.com/image/" + imageId;

                    try {
                        // Generate QR code
                        const qrCode = await QRCode.toDataURL(qrLink);

                        // Save QR code to database
                        db.run(
                            "UPDATE images SET qr = ? WHERE id = ?",
                            [qrCode, imageId],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error(
                                        "QR database update error:",
                                        updateErr
                                    );

                                    return res
                                        .status(500)
                                        .send("Could not save QR code.");
                                }

                                res.render("result", {
    name: name,
    idNumber: idNumber,
    image: "https://qr-image-manager.onrender.com/image/" + imageId,
    qr: qrCode
});
                            }
                        );
                    } catch (qrError) {
                        console.error(
                            "QR generation error:",
                            qrError
                        );

                        return res
                            .status(500)
                            .send("QR code generation failed.");
                    }
                }
            );
        } catch (error) {
            console.error("Upload error:", error);
            res.status(500).send("An error occurred.");
        }
    }
);

// ==============================
// PUBLIC IMAGE ROUTE
// ==============================
// Nice page when scanning QR code
app.get("/image/:id", (req, res) => {
    const id = req.params.id;

    db.get("SELECT * FROM images WHERE id = ?", [id], (err, row) => {
        if (err || !row) {
            return res.status(404).send("Image not found");
        }

        res.render("view-image", {
            id: id,
            name: row.name,
            idNumber: row.idNumber
        });
    });
});

// Actual image file (used by the page above)
app.get("/image-file/:id", (req, res) => {
    const id = req.params.id;

    db.get("SELECT * FROM images WHERE id = ?", [id], (err, row) => {
        if (err || !row) {
            return res.status(404).send("Image not found");
        }

        const filename = path.basename(row.image);
        const filePath = path.join(uploadDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send("Image file not found");
        }

        res.sendFile(filePath);
    });
});

// ==============================
// ADMIN GALLERY
// ==============================

app.get("/gallery", requireLogin, (req, res) => {
    db.all(
        "SELECT * FROM images ORDER BY id DESC",
        [],
        (err, rows) => {
            if (err) {
                console.error("Gallery database error:", err);
                return res.status(500).send("Database error");
            }

            res.render("gallery", {
                images: rows
            });
        }
    );
});

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
