<?php
/** @var array $_ */
?>
<div id="imageflow-app"
	data-page="<?php p($_['page'] ?? 'jobs'); ?>"
	data-job-id="<?php p((string)($_['jobId'] ?? '')); ?>">
	<div class="imageflow-shell" aria-busy="true"></div>
</div>
