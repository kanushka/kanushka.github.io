// Everything the room says lives here. Edit this file to update the site.

export const profile = {
    name: "Kanushka Gayan",
    role: "Software Engineer",
    tagline: "I make crispy websites and mobile Apps. Follow me anywhere.",
    tags: "#webdeveloper #mllover",
    email: "hello@kanushka.com",
    avatar: "images/kanushka-smile.png",
    cv: "kanushka_gayan_cv.pdf",
};

export const socials = [
    { name: "GitHub", handle: "@kanushka", url: "https://github.com/kanushka" },
    { name: "LinkedIn", handle: "kanushka-gayan", url: "https://www.linkedin.com/in/kanushka-gayan" },
    { name: "Twitter", handle: "@KanushkaTwi", url: "https://twitter.com/KanushkaTwi" },
    { name: "Instagram", handle: "@kanushkanet", url: "https://www.instagram.com/kanushkanet/" },
    { name: "Facebook", handle: "kanushkanet", url: "https://www.facebook.com/kanushkanet" },
];

// One entry per book on the shelf. Replace these with real projects.
export const projects = [
    { title: "Crispy websites", blurb: "Fast, good-looking sites for the web.", url: "https://github.com/kanushka" },
    { title: "Mobile apps", blurb: "Apps for Android and iOS.", url: "https://github.com/kanushka" },
    { title: "ML experiments", blurb: "Side projects with machine learning.", url: "https://github.com/kanushka" },
    { title: "kanushka.com", blurb: "This lofi room, built with Three.js.", url: "https://github.com/kanushka/kanushka.github.io" },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Panel HTML for each clickable spot in the room.
export const panels = {
    about: () => `
        <img class="avatar" src="${profile.avatar}" alt="">
        <h2 id="panel-title">hey, I'm ${esc(profile.name.split(" ")[0])}</h2>
        <p class="kicker">${esc(profile.role.toLowerCase())}</p>
        <p>${esc(profile.tagline)}</p>
        <p class="kicker">${esc(profile.tags)}</p>
        <p>Grab a coffee and look around. The bookshelf has my projects, the corkboard has my CV and my phone has every way to reach me. There's a game on the TV and an easel if you feel like painting.</p>`,

    projects: () => `
        <h2 id="panel-title">the bookshelf</h2>
        <p class="kicker">things I've built</p>
        <ul class="list">${projects.map((p) => `
            <li><a href="${esc(p.url)}" target="_blank" rel="noopener"><b>${esc(p.title)}</b><small>${esc(p.blurb)}</small></a></li>`).join("")}
        </ul>`,

    cv: () => `
        <h2 id="panel-title">my CV</h2>
        <p class="kicker">pinned on the corkboard</p>
        <p>Experience, skills and education, all in one PDF.</p>
        <p><a class="pill" href="${profile.cv}" target="_blank" rel="noopener">open CV</a></p>`,

    games: () => `
        <h2 id="panel-title">kanushka arcade</h2>
        <p class="kicker">the console under the tv</p>
        <div class="toy-slot" data-toy="game"></div>
        <div class="dpad" aria-label="Controls">
            <button data-dir="0,-1" aria-label="up">&#9650;</button>
            <button data-dir="-1,0" aria-label="left">&#9664;</button>
            <button data-dir="0,1" aria-label="down">&#9660;</button>
            <button data-dir="1,0" aria-label="right">&#9654;</button>
        </div>
        <p class="small-note">Arrow keys or swipe to steer. Your score shows on the TV too.</p>`,

    paint: () => `
        <h2 id="panel-title">the easel</h2>
        <p class="kicker">leave a little doodle</p>
        <div class="toy-slot" data-toy="paint"></div>
        <p class="small-note">Whatever you paint shows up on the easel in the room.</p>`,

    contact: () => `
        <h2 id="panel-title">say hello</h2>
        <p class="kicker">messages always welcome</p>
        <ul class="list">
            <li><a href="mailto:${profile.email}"><b>Email</b><small>${esc(profile.email)}</small></a></li>${socials.map((s) => `
            <li><a href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.name)}</b><small>${esc(s.handle)}</small></a></li>`).join("")}
        </ul>`,
};
