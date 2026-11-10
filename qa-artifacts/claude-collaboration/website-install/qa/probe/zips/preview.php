<?php
/*
Plugin Name: Machines & Cloud Website Chat
Description: Adds your configured Machines & Cloud chat to the public website footer.
Version: 1.0.0
*/
if (!defined('ABSPATH')) { exit; }
add_action('wp_footer', static function () {
    echo '<script src="https://deploy-preview-42--machinesandcloud.netlify.app/embed.js" data-client="shop-00ff" async></script>';
}, 20);
