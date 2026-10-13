type Result<T, E> = {
	success: true,
	value: T
} | {
	success: false,
	error: E
}

export function nothrow<T, E>(cb: () => T): Result<T, E> {
	try {
		return {
			success: true,
			value: cb()
		};
	} catch(e: any) {
		return {
			success: false,
			error: e
		};
	}
}

export function nothrowAsync<T, E>(cb: () => Promise<T>): Promise<Result<T, E>> {
	return new Promise(resolve => {
		cb()
			.then(value => resolve({
				success: true,
				value
			}))
			.catch(error => resolve({
				success: false,
				error
			}))
	});
}

export function chunk<T>(a: T[], stride: number) {
	return Array.from({ length: Math.ceil(a.length / stride) }, (_, i) =>
		a.slice(i * stride, i * stride + stride)
	);
}
