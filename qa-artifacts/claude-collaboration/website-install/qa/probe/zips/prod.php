<?php
/*
Plugin Name: Machines & Cloud Website Chat
Description: Adds your configured Machines & Cloud chat to the public website footer.
Version: 1.0.0
*/
if (!defined('ABSPATH')) { exit; }
add_action('wp_footer', static function () {
    echo '<script src="https://machinesandcloud.com/embed.js" data-client="acme-hvac-3f9a" async></script>';
}, 20);
