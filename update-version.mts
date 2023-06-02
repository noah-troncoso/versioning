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
		const { GIT_USER, GIT_TOKEN, GIT_REPO } = process.env;

		if (!GIT_USER) throw new Error('GIT_USER is not defined');
		if (!GIT_TOKEN) throw new Error('GIT_TOKEN is not defined');
		if (!GIT_REPO) throw new Error('GIT_REPO is not defined');
		
		const source = client
			.host()
			.directory(resolve('./'), { include: [
				'package.json',
				'package-lock.json',
				'.git',
			]});

		const version = generateVersion();
		const image = client.container().from('node:16-alpine');;
		const result = await image 
			.withMountedDirectory('/app', source)
			.withWorkdir('/app')
			// Install git
			.withExec(['apk', '--no-cache', 'add', 'git'])
			.withExec(['npm', 'version', version, '--no-git-tag'])
			.withExec(['git', 'config', 'user.email', 'github.actions@underarmour.com'])
			.withExec(['git', 'config', 'user.name', 'GitHub Actions'])
			.withExec(['git', 'remote', 'set-url', 'origin', `https://${GIT_TOKEN}@github.com/${GIT_USER}/${GIT_REPO}.git`])
			.withExec(['git', 'add', 'package.json', 'package-lock.json'])
			// --no-verify skips pre-commit hooks
			.withExec(['git', 'commit', '--no-verify', '-m', `Updating version to ${version} [skip ci]`])
			.withExec(['git', 'tag', version])
			.withExec(['git', 'push', '--atomic', 'origin', 'HEAD:main'])
			.withExec(['git', 'push', 'origin', version])
			.exitCode();

		if (!result) {
			console.log('Version updated to ', version);
		} else {
			throw new Error('Failed to update version with exit code ' + result);
		}
  	},
  	{ LogOutput: process.stdout },
)

