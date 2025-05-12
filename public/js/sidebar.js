// public/js/sidebar.js
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('user-sidebar');
    const backdrop = document.getElementById('user-sidebar-backdrop');
    const openSidebarButton = document.getElementById('user-icon-button'); // This is the button in your header that opens the sidebar
    const closeSidebarButton = document.getElementById('close-sidebar-button');

    const firstFocusableElement = sidebar.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const focusableContent = sidebar.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const lastFocusableElement = focusableContent[focusableContent.length - 1];

    function openSidebar() {
        if (!sidebar || !backdrop) return;
        sidebar.classList.add('open');
        backdrop.classList.add('visible');
        backdrop.setAttribute('aria-hidden', 'false');
        sidebar.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        if (openSidebarButton) {
            openSidebarButton.setAttribute('aria-expanded', 'true');
            openSidebarButton.classList.add('open'); 
        }
        if (firstFocusableElement) {
            firstFocusableElement.focus();
        }
        // Dispatch custom event for icon animation
        document.dispatchEvent(new CustomEvent('sidebar:open'));
    }

    function closeSidebar() {
        if (!sidebar || !backdrop) return;
        sidebar.classList.remove('open');
        backdrop.classList.remove('visible');
        backdrop.setAttribute('aria-hidden', 'true');
        sidebar.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = ''; // Restore background scroll
        if (openSidebarButton) {
            openSidebarButton.setAttribute('aria-expanded', 'false');
            openSidebarButton.classList.remove('open');
            openSidebarButton.focus(); // Return focus to the button that opened the sidebar
        }
        // Dispatch custom event for icon animation
        document.dispatchEvent(new CustomEvent('sidebar:close'));
    }

    if (openSidebarButton) {
        openSidebarButton.addEventListener('click', (e) => {
            e.stopPropagation();
            openSidebar();
        });
    }

    if (closeSidebarButton) {
        closeSidebarButton.addEventListener('click', () => {
            closeSidebar();
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeSidebar();
        });
    }

    // Keyboard navigation (Escape key to close, Tab trapping)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeSidebar();
        }

        if (e.key === 'Tab' && sidebar.classList.contains('open')) {
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstFocusableElement) {
                    lastFocusableElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastFocusableElement) {
                    firstFocusableElement.focus();
                    e.preventDefault();
                }
            }
        }
    });

    // Ensure the open button has correct ARIA attributes initially
    if(openSidebarButton){
        openSidebarButton.setAttribute('aria-haspopup', 'dialog');
        openSidebarButton.setAttribute('aria-expanded', 'false');
        openSidebarButton.setAttribute('aria-controls', 'user-sidebar');
    }
});

