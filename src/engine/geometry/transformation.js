import { Coord3D } from './coord3d.js';
import { Coord4D } from './coord4d.js';
import { Matrix, MatrixIsEqual } from './matrix.js';
import * as THREE from 'three';

export class Transformation {
    constructor(matrix) {
        if (matrix !== undefined && matrix !== null) {
            this.matrix = matrix;
        } else {
            this.matrix = new Matrix();
            this.matrix.CreateIdentity();
        }
    }

    SetMatrix(matrix) {
        this.matrix = matrix;
        return this;
    }

    GetMatrix() {
        return this.matrix;
    }

    IsIdentity() {
        return this.matrix.IsIdentity();
    }

    AppendMatrix(matrix) {
        this.matrix = this.matrix.MultiplyMatrix(matrix);
        return this;
    }

    Append(transformation) {
        this.AppendMatrix(transformation.GetMatrix());
        return this;
    }

    TransformCoord3D(coord) {
        let coord4D = new Coord4D(coord.x, coord.y, coord.z, 1.0);
        let resultCoord4D = this.matrix.MultiplyVector(coord4D);
        let result = new Coord3D(resultCoord4D.x, resultCoord4D.y, resultCoord4D.z);
        return result;
    }

    Translate(x, y, z) {
        let translationMatrix = new Matrix();
        translationMatrix.CreateTranslation(x, y, z);
        this.AppendMatrix(translationMatrix);
        return this;
    }

    SetTranslation(x, y, z) {
        this.matrix.SetTranslation(x, y, z);
        return this;
    }

    GetTranslation() {
        return new THREE.Vector3(this.matrix.matrix[12], this.matrix.matrix[13], this.matrix.matrix[14]);
    }

    Clone() {
        const clonedMatrix = this.matrix.Clone();
        return new Transformation(clonedMatrix);
    }
}

export function TransformationIsEqual(a, b) {
    return MatrixIsEqual(a.GetMatrix(), b.GetMatrix());
}
