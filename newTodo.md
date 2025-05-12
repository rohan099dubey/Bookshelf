🧠 Frontend Integration Prompt for New Bookshelf Features
Objective:
Update the frontend (EJS/HTML/CSS/JS) of the Bookshelf web app to support and visually expose the new backend features that have been added: blogs, recommendation lists, peer e-book marketplace, genre-based communities, and university resource groups.

🔧 Tasks to Perform:
📌 1. Blog Section (Reader Blog Column)
Add a "📖 My Blogs" section in the user dashboard navigation bar

Create blogs.ejs:

Blog creation form: title, content (Markdown supported), optional book tag

Display user-written blogs with title, excerpt, upvotes

Create allBlogs.ejs:

Public feed of latest and most upvoted blogs

Integrate upvote button (AJAX preferred for async)

📌 2. Book Recommendation Lists
New menu item: “📚 Recommendations”

Create recommendations.ejs:

UI for users to create a list (title, description, book selections from library)

Show lists with upvote button and total votes

Sort by trending/upvoted/popular

📌 3. Genre-Based Communities
Add “🎭 Communities” tab in navbar

Page: communities.ejs

List of all genre groups with Join/Leave button

Inside group: threaded discussion feed (EJS loop of posts & replies)

Create post form with text input + submit button

📌 4. Peer-to-Peer E-Book Marketplace
Add new section “💸 Marketplace” on homepage/dashboard

Page: marketplace.ejs

Upload form for sellers: title, file, description, price

List of books with price tag and "Buy" button

Add My Trades page: show sold and purchased books

📌 5. University-Based Student Groups
Add tab: “🎓 University Groups”

Page: universityGroups.ejs

List of all active university groups (name, department, year)

Join/Leave option, group feed to share PDFs, slides, videos

Inside group:

Upload form (title, file, isFree toggle)

Display shared resources + upvote/download

🛠️ General UI Suggestions
Use EJS partials for cards (blog, group, resource)

Conditional rendering using if user.role === "student" or user.isVerified

Mobile responsive using flex/grid layout

Highlight new features with badges or banners

Expected Result:
A clean, user-friendly interface across all user roles (buyer, seller, student) with clear navigation and access to the newly added features.

Let me know if you’d like HTML/EJS code snippets or wireframe references!
