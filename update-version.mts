import Client, { connect } from '@dagger.io/dagger';
import { resolve } from 'path';

/**
 * Update version in package.json/package-lock.json using the format yyyy.mm.dd-ss
 * Note: seconds are hyphonated so that this still technically matches semver.
 * */

function generateVersion() {
	const date = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}));
	const [year, month, day] = date.toISOString().split('T')[0].split('-');
	const midnight = new Date(Number(year), Number(month) - 1, Number(day));
	const seconds = (date.getTime() - midnight.getTime()) / 1000;
	return `${year}.${month}.${day}-${seconds}`;
}

connect(
  	async (client: Client) => {
		const { GIT_USER, GIT_TOKEN, GIT_REPO, GIT_MAIN_BRANCH, GIT_DEV_BRANCH } = process.env;

		if (!GIT_USER) throw new Error('GIT_USER is not defined');
		if (!GIT_TOKEN) throw new Error('GIT_TOKEN is not defined');
		if (!GIT_REPO) throw new Error('GIT_REPO is not defined');
		if (!GIT_MAIN_BRANCH) throw new Error('GIT_REMOTE_BRANCH is not defined');
		if (!GIT_DEV_BRANCH) throw new Error('GIT_DEV_BRANCH is not defined');

		const source = client
			.host()
			.directory(resolve('./'), { include: [
				'package.json',
				'package-lock.json',
				'.git',
			]});

		const version = generateVersion();
		const image = client.container().from('node:16-alpine');
		const result = await image 
			.withMountedDirectory('/app', source)
			.withWorkdir('/app')
			// Install git
			.withExec(['apk', '--no-cache', 'add', 'git'])
			.withExec(['npm', 'version', version, '--no-git-tag'])
			.withExec(['git', 'config', 'user.email', 'github.actions@underarmour.com'])
			.withExec(['git', 'config', 'user.name', 'GitHub Actions'])
			// This needs to be removed so auth works correctly, however it doesn't exist when running
			// locally, so we set it here so the --unset call doesn't fail
			.withExec(['git', 'config', 'http.https://github.com/.extraheader', '1'])
			.withExec(['git', 'config', '--unset', 'http.https://github.com/.extraheader'])
			.withExec(['git', 'remote', 'set-url', 'origin', `https://${GIT_TOKEN}@github.com/${GIT_REPO}.git`])
			.withExec(['git', 'config', '-l'])
			.withExec(['git', 'fetch', '--all'])
			.withExec(['git', 'checkout', '-b', 'version-update'])
			.withExec(['git', 'add', 'package.json', 'package-lock.json'])
			// --no-verify skips pre-commit hooks
			.withExec(['git', 'commit', '--no-verify', '-m', `Updating version to ${version} [skip ci]`])
			.withExec(['git', 'checkout', GIT_MAIN_BRANCH])
			.withExec(['git', 'merge', '--no-ff', '--no-edit', 'version-update'])
			.withExec(['git', 'tag', version])
			.withExec(['git', 'push', '--atomic', 'origin', `${GIT_MAIN_BRANCH}`])
			.withExec(['git', 'push', 'origin', version])
			.withExec(['git', 'checkout', GIT_DEV_BRANCH])
			.withExec(['git', 'merge', '--no-ff', '--no-edit', '--allow-unrelated-histories', 'version-update'])
			.withExec(['git', 'push', '--atomic', 'origin', `${GIT_DEV_BRANCH}`])
			.exitCode();

		if (!result) {
			console.log('Version updated to ', version);
		} else {
			throw new Error('Failed to update version with exit code ' + result);
		}
  	},
  	{ LogOutput: process.stdout },
)

