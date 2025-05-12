🧠 Prompt for AI Agent: Implement New Features in the Bookshelf Platform
Project Name:
📚 Bookshelf – Extended Feature Integration

📌 Goal:
Extend the existing Bookshelf web platform (built with Node.js, Express, EJS, and MongoDB/MySQL) by adding community engagement tools, blog and recommendation systems, peer-to-peer book selling, and student-focused resource sharing within university-based groups.

✅ New Features to Build & Integrate

1. 📝 Reader Blog Column
   Create a new section on the user dashboard: My Blogs

Allow users to:

Write and publish blogs about books

Use Markdown or rich text editor for formatting

View their own and others’ blogs

Implement blog feed with:

Sorting options (recent, popular)

EJS rendering for blog cards

Like/Upvote option per blog

Backend:

Blog schema: title, content, author, book reference, timestamps, upvotes

2. 📚 Book Recommendation Lists
   Let users create recommendation lists with:

Custom list name, description

Add books from their library or the main catalog

Upvote others' lists

Display trending lists on homepage/community tab

Backend:

List schema: title, description, bookIDs[], creatorID, upvotes

3. 💬 Genre-Based Communities/Groups
   Users can create or join groups based on genre (e.g., Fantasy, Sci-Fi, Non-fiction)

Each group should have:

Group page with name, description, genre tag

Forum-style post and comment threads

Member list and join/leave options

Backend:

Group schema: name, genre, description, creator, members[], posts[]

Post schema: content, author, comments[]

4. 💸 Peer-to-Peer E-Book Marketplace
   Enable users to list e-books for sale or free sharing

Key elements:

Upload form (title, author, category, price, file upload)

Book preview/download for buyers

Buyer payment gateway integration (if paid)

Add "My Trades" section for buyers/sellers to track purchases and uploads

5. 🎓 University-Based Groups for Students
   Add university group creation feature (fields: name, department, year, description)

Allow students to:

Join groups based on their college/university

Upload/share lecture notes, PDFs, recordings, slides

Mark resources as “free” or “paid”

Comment/upvote resources

Optional email verification with .edu or manual admin approval

Backend:

UniversityGroup schema: name, dept, year, members[], posts[]

Resource schema: fileType, title, description, uploaderID, isPaid
